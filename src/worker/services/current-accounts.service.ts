import type { ServiceContext } from '../env';
import { Errors } from '../lib/errors';
import { auditStmt, nowIso } from '../lib/db';
import type {
  AccountCommitmentCreateInput,
  AccountReceiptCreateInput,
  AccountMovementDetail,
  CustomerAccountBalanceItem,
  DepositCreateInput,
  DepositStatusUpdateInput,
  CustomerDepositDetail,
  PaymentBreakdownLine,
  ClientDirectoryItem,
  OverdueFollowUpItem,
  Client360Profile,
  ClientQuoteSummaryItem,
} from '../../shared/current-accounts';

export class CurrentAccountsService {
  constructor(private ctx: ServiceContext) {}

  private async getNextMovementNumber(prefix: 'CMP' | 'REC'): Promise<string> {
    const row = await this.ctx.db
      .prepare('SELECT MAX(id) as max_id FROM customer_account_movements')
      .first<{ max_id: number | null }>();
    const nextId = (row?.max_id || 0) + 1;
    return `${prefix}-${String(nextId).padStart(5, '0')}`;
  }

  private async getNextDepositNumber(): Promise<string> {
    const row = await this.ctx.db
      .prepare('SELECT MAX(id) as max_id FROM customer_deposits')
      .first<{ max_id: number | null }>();
    const nextId = (row?.max_id || 0) + 1;
    return `SEN-${String(nextId).padStart(5, '0')}`;
  }

  private async ensureCustomerId(
    customerId: number | null | undefined,
    name: string,
    phone?: string | null,
    cuit?: string | null,
  ): Promise<number | null> {
    if (customerId) return customerId;
    const cleanName = name.trim();
    if (!cleanName) return null;

    const existing = await this.ctx.db
      .prepare('SELECT id FROM customers WHERE lower(trim(name)) = lower(trim(?)) LIMIT 1')
      .bind(cleanName)
      .first<{ id: number }>();
    if (existing) return existing.id;

    const now = nowIso();
    const res = await this.ctx.db
      .prepare(
        `INSERT INTO customers (name, customer_type, phone, cuit, city, notes, created_at, updated_at)
         VALUES (?, 'empresa', ?, ?, 'San Carlos de Bariloche', 'Alta desde Cuentas Corrientes / Señas', ?, ?)`,
      )
      .bind(cleanName, phone?.trim() || null, cuit?.trim() || null, now, now)
      .run();

    return res.meta.last_row_id;
  }

  /**
   * 1. Crea un Compromiso de Pago por mercadería retirada (con N° Factura / N° Remito si existiera).
   */
  async createCommitment(input: AccountCommitmentCreateInput): Promise<AccountMovementDetail> {
    const now = nowIso();
    const movementNumber = await this.getNextMovementNumber('CMP');
    const resolvedCustomerId = await this.ensureCustomerId(
      input.customerId,
      input.customerName,
      input.customerPhone,
      input.customerCuit,
    );

    const res = await this.ctx.db
      .prepare(
        `INSERT INTO customer_account_movements (
          movement_number, customer_id, customer_name, customer_phone, customer_cuit,
          movement_type, invoice_number, remito_number, sale_id, promised_payment_date,
          withdrawn_by_name, items_summary, amount_cents, notes, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, 'commitment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        movementNumber,
        resolvedCustomerId,
        input.customerName.trim(),
        input.customerPhone?.trim() || null,
        input.customerCuit?.trim() || null,
        input.invoiceNumber?.trim() || null,
        input.remitoNumber?.trim() || null,
        input.saleId ?? null,
        input.promisedPaymentDate?.trim() || null,
        input.withdrawnByName?.trim() || null,
        input.itemsSummary.trim(),
        input.amountCents,
        input.notes?.trim() || null,
        this.ctx.user.id,
        now,
      )
      .run();

    const id = res.meta.last_row_id;
    await auditStmt(this.ctx, 'current_account.commitment_create', 'customer_account_movements', id, {
      movementNumber,
      customerName: input.customerName,
      invoiceNumber: input.invoiceNumber,
      remitoNumber: input.remitoNumber,
      amountCents: input.amountCents,
    }).run();

    return (await this.getMovementById(id))!;
  }

  /**
   * 2. Crea un Recibo Oficial de dinero a cuenta (en cualquier formato: Mercado Libre, Efectivo, Cheques, Transferencia o Mixto).
   */
  async createReceipt(input: AccountReceiptCreateInput): Promise<AccountMovementDetail> {
    const now = nowIso();
    const movementNumber = await this.getNextMovementNumber('REC');
    const resolvedCustomerId = await this.ensureCustomerId(
      input.customerId,
      input.customerName,
      input.customerPhone,
      input.customerCuit,
    );

    const breakdown: PaymentBreakdownLine[] =
      input.breakdown && input.breakdown.length > 0
        ? input.breakdown
        : [
            {
              format: input.paymentFormat === 'mixto' ? 'efectivo' : input.paymentFormat,
              amountCents: input.amountCents,
              chequeNumber: input.chequeNumber || null,
              chequeBank: input.chequeBank || null,
              chequeDueDate: input.chequeDueDate || null,
            },
          ];

    const totalAmountCents =
      input.breakdown && input.breakdown.length > 0
        ? input.breakdown.reduce((acc, b) => acc + b.amountCents, 0)
        : input.amountCents;

    const firstCheque = breakdown.find((b) => b.format === 'cheque');

    const res = await this.ctx.db
      .prepare(
        `INSERT INTO customer_account_movements (
          movement_number, customer_id, customer_name, customer_phone, customer_cuit,
          movement_type, invoice_number, remito_number, payment_format, payment_breakdown_json,
          cheque_number, cheque_bank, cheque_due_date, amount_cents, notes, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, 'receipt', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        movementNumber,
        resolvedCustomerId,
        input.customerName.trim(),
        input.customerPhone?.trim() || null,
        input.customerCuit?.trim() || null,
        input.invoiceNumber?.trim() || null,
        input.remitoNumber?.trim() || null,
        breakdown.length > 1 ? 'mixto' : input.paymentFormat,
        JSON.stringify(breakdown),
        input.chequeNumber?.trim() || firstCheque?.chequeNumber || null,
        input.chequeBank?.trim() || firstCheque?.chequeBank || null,
        input.chequeDueDate?.trim() || firstCheque?.chequeDueDate || null,
        totalAmountCents,
        input.notes?.trim() || null,
        this.ctx.user.id,
        now,
      )
      .run();

    const id = res.meta.last_row_id;
    await auditStmt(this.ctx, 'current_account.receipt_create', 'customer_account_movements', id, {
      movementNumber,
      customerName: input.customerName,
      paymentFormat: input.paymentFormat,
      amountCents: totalAmountCents,
    }).run();

    return (await this.getMovementById(id))!;
  }

  async getMovementById(id: number): Promise<AccountMovementDetail | null> {
    const r = await this.ctx.db
      .prepare(
        `SELECT m.*, u.display_name AS user_name
         FROM customer_account_movements m
         JOIN users u ON u.id = m.user_id
         WHERE m.id = ?`,
      )
      .bind(id)
      .first<any>();

    if (!r) return null;
    return this.mapMovementRow(r);
  }

  private mapMovementRow(r: any): AccountMovementDetail {
    let breakdown: PaymentBreakdownLine[] = [];
    if (r.payment_breakdown_json) {
      try {
        breakdown = JSON.parse(r.payment_breakdown_json);
      } catch {
        breakdown = [];
      }
    }
    return {
      id: r.id,
      movementNumber: r.movement_number,
      customerId: r.customer_id ?? null,
      customerName: r.customer_name,
      customerPhone: r.customer_phone ?? null,
      customerCuit: r.customer_cuit ?? null,
      movementType: r.movement_type,
      invoiceNumber: r.invoice_number ?? null,
      remitoNumber: r.remito_number ?? null,
      saleId: r.sale_id ?? null,
      promisedPaymentDate: r.promised_payment_date ?? null,
      withdrawnByName: r.withdrawn_by_name ?? null,
      itemsSummary: r.items_summary ?? null,
      paymentFormat: r.payment_format ?? null,
      paymentBreakdown: breakdown,
      chequeNumber: r.cheque_number ?? null,
      chequeBank: r.cheque_bank ?? null,
      chequeDueDate: r.cheque_due_date ?? null,
      amountCents: r.amount_cents,
      notes: r.notes ?? null,
      userId: r.user_id,
      userName: r.user_name || 'Mostrador',
      createdAt: r.created_at,
    };
  }

  /**
   * 3. Obtiene el estado de todas las Cuentas Corrientes (Saldos por cliente, Compromisos y Recibos).
   */
  async getAccountsOverview(query: { q?: string; customerName?: string; movementType?: string } = {}): Promise<{
    summary: {
      totalReceivableCents: number;
      totalCreditInFavorCents: number;
      totalChequesReceivedCents: number;
      customersWithDebtCount: number;
    };
    customerBalances: CustomerAccountBalanceItem[];
    movements: AccountMovementDetail[];
  }> {
    const allRows = await this.ctx.db
      .prepare(
        `SELECT m.*, u.display_name AS user_name
         FROM customer_account_movements m
         JOIN users u ON u.id = m.user_id
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 300`,
      )
      .all<any>();

    const allMovements = (allRows.results || []).map((r) => this.mapMovementRow(r));

    // Agrupar saldos por cliente
    const balanceMap = new Map<string, CustomerAccountBalanceItem>();
    let totalChequesReceivedCents = 0;

    for (const mov of allMovements) {
      const key = mov.customerName.trim().toLowerCase();
      let entry = balanceMap.get(key);
      if (!entry) {
        entry = {
          customerName: mov.customerName,
          customerId: mov.customerId,
          customerPhone: mov.customerPhone,
          customerCuit: mov.customerCuit,
          totalCommitmentsCents: 0,
          totalReceiptsCents: 0,
          balanceCents: 0,
          movementsCount: 0,
          lastMovementAt: mov.createdAt,
          nextPromisedDate: null,
        };
        balanceMap.set(key, entry);
      }

      entry.movementsCount += 1;
      if (!entry.customerPhone && mov.customerPhone) entry.customerPhone = mov.customerPhone;
      if (!entry.customerCuit && mov.customerCuit) entry.customerCuit = mov.customerCuit;

      if (mov.movementType === 'commitment') {
        entry.totalCommitmentsCents += mov.amountCents;
        if (mov.promisedPaymentDate) {
          if (!entry.nextPromisedDate || mov.promisedPaymentDate < entry.nextPromisedDate) {
            entry.nextPromisedDate = mov.promisedPaymentDate;
          }
        }
      } else {
        entry.totalReceiptsCents += mov.amountCents;
        // Sumar cheques recibidos
        if (mov.paymentBreakdown && mov.paymentBreakdown.length > 0) {
          for (const b of mov.paymentBreakdown) {
            if (b.format === 'cheque') totalChequesReceivedCents += b.amountCents;
          }
        } else if (mov.paymentFormat === 'cheque') {
          totalChequesReceivedCents += mov.amountCents;
        }
      }

      entry.balanceCents = entry.totalCommitmentsCents - entry.totalReceiptsCents;
    }

    const customerBalances = Array.from(balanceMap.values()).sort((a, b) => b.balanceCents - a.balanceCents);

    let totalReceivableCents = 0;
    let totalCreditInFavorCents = 0;
    let customersWithDebtCount = 0;

    for (const c of customerBalances) {
      if (c.balanceCents > 0) {
        totalReceivableCents += c.balanceCents;
        customersWithDebtCount += 1;
      } else if (c.balanceCents < 0) {
        totalCreditInFavorCents += Math.abs(c.balanceCents);
      }
    }

    // Filtrar movimientos según búsqueda
    let filteredMovements = allMovements;
    if (query.customerName && query.customerName.trim()) {
      const target = query.customerName.trim().toLowerCase();
      filteredMovements = filteredMovements.filter((m) => m.customerName.trim().toLowerCase() === target);
    }
    if (query.movementType && query.movementType !== 'all') {
      filteredMovements = filteredMovements.filter((m) => m.movementType === query.movementType);
    }
    if (query.q && query.q.trim()) {
      const term = query.q.trim().toLowerCase();
      filteredMovements = filteredMovements.filter(
        (m) =>
          m.customerName.toLowerCase().includes(term) ||
          m.movementNumber.toLowerCase().includes(term) ||
          (m.invoiceNumber && m.invoiceNumber.toLowerCase().includes(term)) ||
          (m.remitoNumber && m.remitoNumber.toLowerCase().includes(term)) ||
          (m.itemsSummary && m.itemsSummary.toLowerCase().includes(term)) ||
          (m.chequeNumber && m.chequeNumber.toLowerCase().includes(term)),
      );
    }

    return {
      summary: {
        totalReceivableCents,
        totalCreditInFavorCents,
        totalChequesReceivedCents,
        customersWithDebtCount,
      },
      customerBalances,
      movements: filteredMovements,
    };
  }

  /**
   * 4. Crea un Registro de Seña a cuenta de un producto que debe pedirse al proveedor.
   */
  async createDeposit(input: DepositCreateInput): Promise<CustomerDepositDetail> {
    const now = nowIso();
    const depositNumber = await this.getNextDepositNumber();
    const resolvedCustomerId = await this.ensureCustomerId(
      input.customerId,
      input.customerName,
      input.customerPhone,
      null,
    );

    const estimatedTotalCents = Math.max(
      input.depositAmountCents,
      (input.estimatedUnitPriceCents || 0) * (input.quantity || 1),
    );
    const remainingBalanceCents = Math.max(0, estimatedTotalCents - input.depositAmountCents);

    const res = await this.ctx.db
      .prepare(
        `INSERT INTO customer_deposits (
          deposit_number, customer_id, customer_name, customer_phone,
          product_id, product_sku, product_description, brand, supplier_name,
          quantity, estimated_unit_price_cents, estimated_total_cents,
          deposit_amount_cents, remaining_balance_cents,
          payment_format, payment_reference, estimated_arrival_date,
          status, notes, user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_order', ?, ?, ?, ?)`,
      )
      .bind(
        depositNumber,
        resolvedCustomerId,
        input.customerName.trim(),
        input.customerPhone?.trim() || null,
        input.productId ?? null,
        input.productSku?.trim() || null,
        input.productDescription.trim(),
        input.brand?.trim() || null,
        input.supplierName?.trim() || null,
        input.quantity || 1,
        input.estimatedUnitPriceCents || 0,
        estimatedTotalCents,
        input.depositAmountCents,
        remainingBalanceCents,
        input.paymentFormat,
        input.paymentReference?.trim() || null,
        input.estimatedArrivalDate?.trim() || null,
        input.notes?.trim() || null,
        this.ctx.user.id,
        now,
        now,
      )
      .run();

    const id = res.meta.last_row_id;
    await auditStmt(this.ctx, 'deposit.create', 'customer_deposits', id, {
      depositNumber,
      customerName: input.customerName,
      productDescription: input.productDescription,
      depositAmountCents: input.depositAmountCents,
    }).run();

    return (await this.getDepositById(id))!;
  }

  async getDepositById(id: number): Promise<CustomerDepositDetail | null> {
    const r = await this.ctx.db
      .prepare(
        `SELECT d.*, u.display_name AS user_name
         FROM customer_deposits d
         JOIN users u ON u.id = d.user_id
         WHERE d.id = ?`,
      )
      .bind(id)
      .first<any>();

    if (!r) return null;
    return this.mapDepositRow(r);
  }

  private mapDepositRow(r: any): CustomerDepositDetail {
    return {
      id: r.id,
      depositNumber: r.deposit_number,
      customerId: r.customer_id ?? null,
      customerName: r.customer_name,
      customerPhone: r.customer_phone ?? null,
      productId: r.product_id ?? null,
      productSku: r.product_sku ?? null,
      productDescription: r.product_description,
      brand: r.brand ?? null,
      supplierName: r.supplier_name ?? null,
      quantity: r.quantity,
      estimatedUnitPriceCents: r.estimated_unit_price_cents,
      estimatedTotalCents: r.estimated_total_cents,
      depositAmountCents: r.deposit_amount_cents,
      remainingBalanceCents: r.remaining_balance_cents,
      paymentFormat: r.payment_format,
      paymentReference: r.payment_reference ?? null,
      estimatedArrivalDate: r.estimated_arrival_date ?? null,
      status: r.status,
      notes: r.notes ?? null,
      userId: r.user_id,
      userName: r.user_name || 'Mostrador',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async listDeposits(query: { q?: string; status?: string } = {}): Promise<{
    items: CustomerDepositDetail[];
    summary: {
      pendingOrderCount: number;
      orderedCount: number;
      arrivedCount: number;
      totalDepositsAmountCents: number;
      totalRemainingToCollectCents: number;
    };
  }> {
    const rows = await this.ctx.db
      .prepare(
        `SELECT d.*, u.display_name AS user_name
         FROM customer_deposits d
         JOIN users u ON u.id = d.user_id
         ORDER BY d.created_at DESC, d.id DESC
         LIMIT 200`,
      )
      .all<any>();

    const allItems = (rows.results || []).map((r) => this.mapDepositRow(r));

    let pendingOrderCount = 0;
    let orderedCount = 0;
    let arrivedCount = 0;
    let totalDepositsAmountCents = 0;
    let totalRemainingToCollectCents = 0;

    for (const d of allItems) {
      if (d.status !== 'cancelled') {
        totalDepositsAmountCents += d.depositAmountCents;
      }
      if (d.status === 'pending_order') {
        pendingOrderCount += 1;
        totalRemainingToCollectCents += d.remainingBalanceCents;
      } else if (d.status === 'ordered_to_supplier') {
        orderedCount += 1;
        totalRemainingToCollectCents += d.remainingBalanceCents;
      } else if (d.status === 'arrived_in_store') {
        arrivedCount += 1;
        totalRemainingToCollectCents += d.remainingBalanceCents;
      }
    }

    let filtered = allItems;
    if (query.status && query.status !== 'all') {
      filtered = filtered.filter((d) => d.status === query.status);
    }
    if (query.q && query.q.trim()) {
      const term = query.q.trim().toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.depositNumber.toLowerCase().includes(term) ||
          d.customerName.toLowerCase().includes(term) ||
          d.productDescription.toLowerCase().includes(term) ||
          (d.productSku && d.productSku.toLowerCase().includes(term)) ||
          (d.supplierName && d.supplierName.toLowerCase().includes(term)),
      );
    }

    return {
      items: filtered,
      summary: {
        pendingOrderCount,
        orderedCount,
        arrivedCount,
        totalDepositsAmountCents,
        totalRemainingToCollectCents,
      },
    };
  }

  async updateDepositStatus(id: number, input: DepositStatusUpdateInput): Promise<CustomerDepositDetail> {
    const existing = await this.getDepositById(id);
    if (!existing) throw Errors.notFound(`La seña #${id}`);

    const now = nowIso();
    const newRemaining =
      input.status === 'delivered_and_settled' || input.status === 'cancelled'
        ? 0
        : existing.remainingBalanceCents;

    await this.ctx.db
      .prepare(
        `UPDATE customer_deposits SET
           status = ?,
           supplier_name = COALESCE(?, supplier_name),
           estimated_arrival_date = COALESCE(?, estimated_arrival_date),
           notes = COALESCE(?, notes),
           remaining_balance_cents = ?,
           updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.status,
        input.supplierName?.trim() || null,
        input.estimatedArrivalDate?.trim() || null,
        input.notes?.trim() || null,
        newRemaining,
        now,
        id,
      )
      .run();

    await auditStmt(this.ctx, 'deposit.status_update', 'customer_deposits', id, {
      depositNumber: existing.depositNumber,
      status: input.status,
    }).run();

    return (await this.getDepositById(id))!;
  }

  /**
   * 5. Directorio Unificado de Clientes con Cuenta Corriente, Presupuestos, Señas y Alertas de Seguimiento Atrasado.
   */
  async getClientsDirectory(query: { q?: string; filter?: string } = {}): Promise<{
    summary: {
      totalClients: number;
      overdueFollowUpCount: number;
      customersWithDebtCount: number;
      totalReceivableCents: number;
      openQuotesCount: number;
      activeDepositsCount: number;
    };
    clients: ClientDirectoryItem[];
    overdueFollowUps: OverdueFollowUpItem[];
  }> {
    const todayIso = new Date().toISOString().slice(0, 10);
    const nowMs = Date.now();

    const [custRes, movRes, quoteRes, depRes, vehRes] = await Promise.all([
      this.ctx.db
        .prepare('SELECT * FROM customers ORDER BY id DESC')
        .all<any>(),
      this.ctx.db
        .prepare('SELECT * FROM customer_account_movements ORDER BY created_at DESC, id DESC')
        .all<any>(),
      this.ctx.db
        .prepare(
          `SELECT q.*,
                  (SELECT GROUP_CONCAT(qi.quantity || 'x ' || qi.description, ', ') FROM quote_items qi WHERE qi.quote_id = q.id) AS items_summary
           FROM quotes q
           ORDER BY q.created_at DESC, q.id DESC`,
        )
        .all<any>(),
      this.ctx.db
        .prepare('SELECT d.*, u.display_name AS user_name FROM customer_deposits d JOIN users u ON u.id = d.user_id ORDER BY d.created_at DESC, d.id DESC')
        .all<any>(),
      this.ctx.db
        .prepare('SELECT customer_id, COUNT(*) AS cnt, GROUP_CONCAT(COALESCE(plate, \'\') || \' \' || COALESCE(brand, \'\') || \' \' || COALESCE(model, \'\'), \' | \') AS plates FROM customer_vehicles GROUP BY customer_id')
        .all<{ customer_id: number; cnt: number; plates: string }>(),
    ]);

    const customers = custRes.results || [];
    const byId = new Map<number, ClientDirectoryItem & { _searchExtra: string; _promisedOverdue: string | null }>();
    const byNormName = new Map<string, number>();

    const vehMap = new Map<number, { cnt: number; plates: string }>();
    for (const v of vehRes.results || []) {
      vehMap.set(v.customer_id, { cnt: v.cnt, plates: v.plates || '' });
    }

    for (const c of customers) {
      const vInfo = vehMap.get(c.id) || { cnt: 0, plates: '' };
      const item: ClientDirectoryItem & { _searchExtra: string; _promisedOverdue: string | null } = {
        id: c.id,
        name: c.name,
        customerType: c.customer_type === 'empresa' ? 'empresa' : 'particular',
        phone: c.phone ?? null,
        cuit: c.cuit ?? null,
        email: c.email ?? null,
        city: c.city ?? null,
        accountBalanceCents: 0,
        totalCommitmentsCents: 0,
        totalReceiptsCents: 0,
        quotesCount: 0,
        openQuotesCount: 0,
        overdueQuotesCount: 0,
        oldestPendingQuoteDays: null,
        oldestPendingQuoteNumber: null,
        depositsCount: 0,
        pendingDepositsCount: 0,
        arrivedUncollectedCount: 0,
        vehiclesCount: vInfo.cnt,
        hasOverdueFollowUp: false,
        overdueReasonSummary: null,
        createdAt: c.created_at,
        _searchExtra: vInfo.plates.toLowerCase(),
        _promisedOverdue: null,
      };
      byId.set(c.id, item);
      byNormName.set(String(c.name || '').trim().toLowerCase(), c.id);
    }

    const resolveTarget = (cid: number | null | undefined, cname: string | null | undefined) => {
      if (cid && byId.has(cid)) return byId.get(cid)!;
      const k = String(cname || '').trim().toLowerCase();
      const mappedId = byNormName.get(k);
      if (mappedId && byId.has(mappedId)) return byId.get(mappedId)!;
      return null;
    };

    // 1. Acumular movimientos de cuenta corriente
    for (const m of movRes.results || []) {
      const target = resolveTarget(m.customer_id, m.customer_name);
      if (!target) continue;
      if (m.movement_type === 'commitment') {
        target.totalCommitmentsCents += m.amount_cents;
        if (m.promised_payment_date && m.promised_payment_date < todayIso) {
          target._promisedOverdue = m.promised_payment_date;
        }
      } else {
        target.totalReceiptsCents += m.amount_cents;
      }
      target.accountBalanceCents = target.totalCommitmentsCents - target.totalReceiptsCents;
    }

    const overdueFollowUps: OverdueFollowUpItem[] = [];
    let openQuotesTotal = 0;

    // 2. Acumular presupuestos y detectar presupuestos antiguos sin retiro confirmado
    for (const q of quoteRes.results || []) {
      const target = resolveTarget(q.customer_id, q.customer_name);
      const createdMs = new Date(q.created_at).getTime();
      const daysElapsed = Math.max(0, Math.floor((nowMs - createdMs) / (1000 * 60 * 60 * 24)));

      const isClosed =
        q.status === 'converted' ||
        q.status === 'rejected' ||
        q.follow_up_status === 'accredited' ||
        q.follow_up_status === 'not_viable';

      const isExpiredDate = Boolean(q.valid_until && q.valid_until < todayIso);
      const isOverdueQuote = !isClosed && (daysElapsed >= 3 || isExpiredDate);

      if (!isClosed) openQuotesTotal += 1;

      if (target) {
        target.quotesCount += 1;
        if (!isClosed) {
          target.openQuotesCount += 1;
          if (target.oldestPendingQuoteDays === null || daysElapsed > target.oldestPendingQuoteDays) {
            target.oldestPendingQuoteDays = daysElapsed;
            target.oldestPendingQuoteNumber = q.quote_number;
          }
        }
        if (isOverdueQuote) {
          target.overdueQuotesCount += 1;
        }
      }

      if (isOverdueQuote) {
        const vehParts = [q.vehicle_brand, q.vehicle_model, q.vehicle_plate].filter(Boolean);
        overdueFollowUps.push({
          kind: 'quote_uncollected',
          customerId: target?.id ?? q.customer_id ?? null,
          customerName: target?.name || q.customer_name,
          customerPhone: target?.phone || q.customer_phone || null,
          customerEmail: target?.email || q.customer_email || null,
          referenceId: q.id,
          referenceNumber: q.quote_number,
          createdAt: q.created_at,
          daysElapsed,
          amountCents: q.total_cents,
          summary: `Presupuesto ${q.quote_number} emitido hace ${daysElapsed} día(s) (${q.items_summary || 'repuestos'}) y aún no se confirmó retiro`,
          vehicleSummary: vehParts.length > 0 ? vehParts.join(' · ') : null,
        });
      }
    }

    // 3. Acumular señas y detectar mercadería señada que ya llegó al local sin retirar
    let activeDepositsTotal = 0;
    for (const d of depRes.results || []) {
      const target = resolveTarget(d.customer_id, d.customer_name);
      const isClosedDep = d.status === 'delivered_and_settled' || d.status === 'cancelled';
      if (!isClosedDep) activeDepositsTotal += 1;

      const createdMs = new Date(d.created_at).getTime();
      const daysElapsed = Math.max(0, Math.floor((nowMs - createdMs) / (1000 * 60 * 60 * 24)));

      if (target) {
        target.depositsCount += 1;
        if (!isClosedDep) target.pendingDepositsCount += 1;
        if (d.status === 'arrived_in_store') target.arrivedUncollectedCount += 1;
      }

      if (d.status === 'arrived_in_store' || (!isClosedDep && d.estimated_arrival_date && d.estimated_arrival_date < todayIso)) {
        overdueFollowUps.push({
          kind: 'deposit_arrived',
          customerId: target?.id ?? d.customer_id ?? null,
          customerName: target?.name || d.customer_name,
          customerPhone: target?.phone || d.customer_phone || null,
          customerEmail: target?.email || null,
          referenceId: d.id,
          referenceNumber: d.deposit_number,
          createdAt: d.created_at,
          daysElapsed,
          amountCents: d.remaining_balance_cents,
          summary:
            d.status === 'arrived_in_store'
              ? `Seña ${d.deposit_number} (${d.product_description}): ya está en el local pendiente de que el cliente retire`
              : `Seña ${d.deposit_number} (${d.product_description}): fecha estimada vencida (${d.estimated_arrival_date})`,
          vehicleSummary: null,
        });
      }
    }

    // 4. Evaluar banderas finales de atraso y deuda por cliente
    let totalReceivableCents = 0;
    let customersWithDebtCount = 0;
    let overdueClientsCount = 0;

    for (const item of byId.values()) {
      if (item.accountBalanceCents > 0) {
        totalReceivableCents += item.accountBalanceCents;
        customersWithDebtCount += 1;
      }

      const reasons: string[] = [];
      if (item.overdueQuotesCount > 0) {
        reasons.push(
          `Presupuesto ${item.oldestPendingQuoteNumber || ''} hace ${item.oldestPendingQuoteDays ?? 3}d sin confirmar retiro`.trim(),
        );
      }
      if (item.arrivedUncollectedCount > 0) {
        reasons.push(`${item.arrivedUncollectedCount} seña(s) en local sin retirar`);
      }
      if (item.accountBalanceCents > 0 && item._promisedOverdue) {
        reasons.push(`Compromiso Cta. Cte. vencido (${item._promisedOverdue})`);
        overdueFollowUps.push({
          kind: 'account_overdue',
          customerId: item.id,
          customerName: item.name,
          customerPhone: item.phone,
          customerEmail: item.email,
          referenceId: item.id,
          referenceNumber: `CTA-${String(item.id).padStart(4, '0')}`,
          createdAt: item.createdAt,
          daysElapsed: Math.max(
            1,
            Math.floor((nowMs - new Date(item._promisedOverdue).getTime()) / (1000 * 60 * 60 * 24)),
          ),
          amountCents: item.accountBalanceCents,
          summary: `Saldo pendiente en cuenta corriente con fecha prometida vencida (${item._promisedOverdue})`,
          vehicleSummary: null,
        });
      }

      if (reasons.length > 0) {
        item.hasOverdueFollowUp = true;
        item.overdueReasonSummary = reasons.join(' · ');
        overdueClientsCount += 1;
      }
    }

    overdueFollowUps.sort((a, b) => b.daysElapsed - a.daysElapsed);

    let list = Array.from(byId.values());
    if (query.filter === 'overdue') {
      list = list.filter((c) => c.hasOverdueFollowUp);
    } else if (query.filter === 'debt') {
      list = list.filter((c) => c.accountBalanceCents !== 0);
    } else if (query.filter === 'quotes') {
      list = list.filter((c) => c.quotesCount > 0);
    } else if (query.filter === 'deposits') {
      list = list.filter((c) => c.depositsCount > 0);
    }

    if (query.q && query.q.trim()) {
      const term = query.q.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.phone && c.phone.toLowerCase().includes(term)) ||
          (c.cuit && c.cuit.toLowerCase().includes(term)) ||
          (c.email && c.email.toLowerCase().includes(term)) ||
          c._searchExtra.includes(term),
      );
    }

    // Ordenar: primero con seguimiento atrasado, luego con saldo cuenta corriente, luego con presupuestos abiertos
    list.sort((a, b) => {
      if (a.hasOverdueFollowUp !== b.hasOverdueFollowUp) return a.hasOverdueFollowUp ? -1 : 1;
      if (b.openQuotesCount !== a.openQuotesCount) return b.openQuotesCount - a.openQuotesCount;
      if (Math.abs(b.accountBalanceCents) !== Math.abs(a.accountBalanceCents)) {
        return Math.abs(b.accountBalanceCents) - Math.abs(a.accountBalanceCents);
      }
      return a.name.localeCompare(b.name, 'es');
    });

    const cleanClients: ClientDirectoryItem[] = list.map(({ _searchExtra, _promisedOverdue, ...rest }) => rest);

    return {
      summary: {
        totalClients: byId.size,
        overdueFollowUpCount: overdueClientsCount,
        customersWithDebtCount,
        totalReceivableCents,
        openQuotesCount: openQuotesTotal,
        activeDepositsCount: activeDepositsTotal,
      },
      clients: cleanClients,
      overdueFollowUps,
    };
  }

  /**
   * 6. Ficha 360° Unificada de un Cliente: Cuenta Corriente, Presupuestos hechos, Señas, Vehículos y Compras.
   */
  async getClient360Profile(customerId: number): Promise<Client360Profile> {
    const cust = await this.ctx.db
      .prepare('SELECT * FROM customers WHERE id = ?')
      .bind(customerId)
      .first<any>();

    if (!cust) throw Errors.notFound(`El cliente #${customerId}`);

    const todayIso = new Date().toISOString().slice(0, 10);
    const nowMs = Date.now();

    const [vehRes, movRes, quoteRes, depRes, salesRes] = await Promise.all([
      this.ctx.db
        .prepare('SELECT id, brand, model, year, engine, plate FROM customer_vehicles WHERE customer_id = ? ORDER BY id DESC')
        .bind(customerId)
        .all<any>(),
      this.ctx.db
        .prepare(
          `SELECT m.*, u.display_name AS user_name
           FROM customer_account_movements m
           JOIN users u ON u.id = m.user_id
           WHERE m.customer_id = ? OR lower(trim(m.customer_name)) = lower(trim(?))
           ORDER BY m.created_at DESC, m.id DESC`,
        )
        .bind(customerId, cust.name)
        .all<any>(),
      this.ctx.db
        .prepare(
          `SELECT q.*,
                  (SELECT GROUP_CONCAT(qi.quantity || 'x ' || qi.description, ', ') FROM quote_items qi WHERE qi.quote_id = q.id) AS items_summary
           FROM quotes q
           WHERE q.customer_id = ? OR lower(trim(q.customer_name)) = lower(trim(?))
           ORDER BY q.created_at DESC, q.id DESC`,
        )
        .bind(customerId, cust.name)
        .all<any>(),
      this.ctx.db
        .prepare(
          `SELECT d.*, u.display_name AS user_name
           FROM customer_deposits d
           JOIN users u ON u.id = d.user_id
           WHERE d.customer_id = ? OR lower(trim(d.customer_name)) = lower(trim(?))
           ORDER BY d.created_at DESC, d.id DESC`,
        )
        .bind(customerId, cust.name)
        .all<any>(),
      this.ctx.db
        .prepare(
          `SELECT id, total_cents, status, created_at
           FROM sales
           WHERE customer_id = ? AND status <> 'voided'
           ORDER BY id DESC
           LIMIT 15`,
        )
        .bind(customerId)
        .all<any>(),
    ]);

    const accountMovements = (movRes.results || []).map((r) => this.mapMovementRow(r));
    let totalCommitmentsCents = 0;
    let totalReceiptsCents = 0;
    let promisedOverdue: string | null = null;

    for (const m of accountMovements) {
      if (m.movementType === 'commitment') {
        totalCommitmentsCents += m.amountCents;
        if (m.promisedPaymentDate && m.promisedPaymentDate < todayIso) {
          promisedOverdue = m.promisedPaymentDate;
        }
      } else {
        totalReceiptsCents += m.amountCents;
      }
    }
    const accountBalanceCents = totalCommitmentsCents - totalReceiptsCents;

    const overdueReasons: string[] = [];

    const quotes: ClientQuoteSummaryItem[] = (quoteRes.results || []).map((q) => {
      const daysElapsed = Math.max(0, Math.floor((nowMs - new Date(q.created_at).getTime()) / (1000 * 60 * 60 * 24)));
      const isClosed =
        q.status === 'converted' ||
        q.status === 'rejected' ||
        q.follow_up_status === 'accredited' ||
        q.follow_up_status === 'not_viable';
      const isExpired = Boolean(q.valid_until && q.valid_until < todayIso);
      const isOverdueFollowUp = !isClosed && (daysElapsed >= 3 || isExpired);
      if (isOverdueFollowUp) {
        overdueReasons.push(`Presupuesto ${q.quote_number} hace ${daysElapsed} día(s) sin confirmar retiro`);
      }
      const vehParts = [q.vehicle_brand, q.vehicle_model, q.vehicle_plate].filter(Boolean);
      return {
        id: q.id,
        quoteNumber: q.quote_number,
        trackingNumber: q.tracking_number ?? null,
        status: q.status,
        followUpStatus: q.follow_up_status || 'pending',
        totalCents: q.total_cents,
        validUntil: q.valid_until,
        createdAt: q.created_at,
        daysElapsed,
        isPendingPickup: !isClosed,
        isOverdueFollowUp,
        vehicleSummary: vehParts.length > 0 ? vehParts.join(' · ') : null,
        itemsSummary: q.items_summary || 'Repuestos cotizados',
      };
    });

    const deposits = (depRes.results || []).map((r) => this.mapDepositRow(r));
    for (const d of deposits) {
      if (d.status === 'arrived_in_store') {
        overdueReasons.push(`Seña ${d.depositNumber} (${d.productDescription}) ya llegó al local y falta retirar`);
      }
    }

    if (accountBalanceCents > 0 && promisedOverdue) {
      overdueReasons.push(`Compromiso de pago vencido desde ${promisedOverdue}`);
    }

    return {
      id: cust.id,
      name: cust.name,
      customerType: cust.customer_type === 'empresa' ? 'empresa' : 'particular',
      phone: cust.phone ?? null,
      cuit: cust.cuit ?? null,
      email: cust.email ?? null,
      address: cust.address ?? null,
      city: cust.city ?? null,
      notes: cust.notes ?? null,
      accountBalanceCents,
      totalCommitmentsCents,
      totalReceiptsCents,
      hasOverdueFollowUp: overdueReasons.length > 0,
      overdueReasons,
      vehicles: (vehRes.results || []).map((v) => ({
        id: v.id,
        brand: v.brand ?? null,
        model: v.model ?? null,
        year: v.year ?? null,
        engine: v.engine ?? null,
        plate: v.plate ?? null,
      })),
      accountMovements,
      quotes,
      deposits,
      recentSales: (salesRes.results || []).map((s) => ({
        id: s.id,
        saleNumber: `VTA-${String(s.id).padStart(5, '0')}`,
        totalCents: s.total_cents,
        status: s.status,
        createdAt: s.created_at,
      })),
    };
  }
}
