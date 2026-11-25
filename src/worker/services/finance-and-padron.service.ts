import type { ServiceContext } from '../env';
import { Errors } from '../lib/errors';
import { auditStmt, nowIso } from '../lib/db';
import { formatWhatsAppPhone } from '../../shared/quotes';
import type {
  CashflowEntryCreateInput,
  CashflowDayRow,
  PaywayBankRuleInput,
  PaywayStatusUpdateInput,
  PaywayReconciliationItem,
  WhatsAppAgendaItem,
  AutomotivePadronItem,
  AutomotivePadronCreateInput,
  ActiveCompanyStatItem,
} from '../../shared/finance-and-padron';

const WEEKDAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export class FinanceAndPadronService {
  constructor(private ctx: ServiceContext) {}

  async getBankRules(): Promise<{ bankEvenDays: string; bankOddDays: string }> {
    const rows = await this.ctx.db
      .prepare("SELECT key, value FROM settings WHERE key IN ('bank_even_days', 'bank_odd_days')")
      .all<{ key: string; value: string }>();

    const map = new Map<string, string>();
    for (const r of rows.results || []) {
      try {
        map.set(r.key, JSON.parse(r.value));
      } catch {
        map.set(r.key, r.value);
      }
    }

    return {
      bankEvenDays: map.get('bank_even_days') || 'Banco Patagonia (Cta. Cte. Días Pares)',
      bankOddDays: map.get('bank_odd_days') || 'Banco Nación (Cta. Cte. Días Impares)',
    };
  }

  async updateBankRules(input: PaywayBankRuleInput): Promise<{ bankEvenDays: string; bankOddDays: string }> {
    const now = nowIso();
    await this.ctx.db.batch([
      this.ctx.db
        .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)')
        .bind('bank_even_days', JSON.stringify(input.bankEvenDays.trim()), now, this.ctx.user.id),
      this.ctx.db
        .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)')
        .bind('bank_odd_days', JSON.stringify(input.bankOddDays.trim()), now, this.ctx.user.id),
      auditStmt(this.ctx, 'finance.bank_rules_update', 'settings', null, input),
    ]);
    return this.getBankRules();
  }

  /**
   * Sincroniza automáticamente todas las ventas con tarjeta del POS hacia la tabla de conciliación Payway,
   * asignando Banco de Día Par o Banco de Día Impar y diferenciando marca y cuotas.
   */
  async syncPosCardSalesToPayway(): Promise<void> {
    const rules = await this.getBankRules();
    const cardSales = await this.ctx.db
      .prepare(
        `SELECT s.id, s.total_cents, s.card_type, s.card_brand, s.installments, s.created_at, pm.name AS pm_name
         FROM sales s
         JOIN payment_methods pm ON pm.id = s.payment_method_id
         WHERE s.status = 'completed'
           AND (s.card_type IS NOT NULL OR lower(pm.name) LIKE '%tarjeta%')
           AND NOT EXISTS (
             SELECT 1 FROM payway_reconciliations pr WHERE pr.sale_id = s.id
           )
         ORDER BY s.id ASC`,
      )
      .all<any>();

    const stmts: D1PreparedStatement[] = [];
    const now = nowIso();

    for (const s of cardSales.results || []) {
      const saleDate = s.created_at.slice(0, 10);
      const dayNum = parseInt(saleDate.slice(8, 10), 10) || 1;
      const isEven = dayNum % 2 === 0;
      const dayParity = isEven ? 'par' : 'impar';
      const assignedBank = isEven ? rules.bankEvenDays : rules.bankOddDays;
      const cardType = s.card_type === 'debito' ? 'debito' : 'credito';
      const cardBrand = s.card_brand || 'Visa';
      const installments = s.installments || 1;

      // Arancel estimado Payway: Débito 1.6%, Crédito 1 cuota 3.2%, Crédito en cuotas 6%
      const feeRate = cardType === 'debito' ? 0.016 : installments > 1 ? 0.06 : 0.032;
      const feeCents = Math.round(s.total_cents * feeRate);
      const netCents = Math.max(0, s.total_cents - feeCents);

      // Plazo de acreditación: Débito 24hs (+1 día), Crédito 48hs hábiles (+2 días)
      const saleMs = new Date(`${saleDate}T12:00:00.000Z`).getTime();
      const addDays = cardType === 'debito' ? 1 : 2;
      const payoutDate = new Date(saleMs + addDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      stmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO payway_reconciliations (
              sale_id, sale_date, day_parity, assigned_bank, card_type, card_brand,
              installments, gross_amount_cents, payway_fee_cents, expected_net_cents,
              expected_payout_date, coupon_number, reconciliation_status, notes, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          )
          .bind(
            s.id,
            saleDate,
            dayParity,
            assignedBank,
            cardType,
            cardBrand,
            installments,
            s.total_cents,
            feeCents,
            netCents,
            payoutDate,
            `POS-${String(s.id).padStart(4, '0')}`,
            `Venta POS #${s.id} (${cardBrand} ${cardType === 'debito' ? 'Débito' : `${installments} cuota(s)`})`,
            now,
          ),
      );
    }

    if (stmts.length > 0) {
      await this.ctx.db.batch(stmts);
    }
  }

  /**
   * 1. Planilla Cash Flow de Caja del Negocio tipo Excel (Día por Día).
   */
  async getCashflowGrid(): Promise<{
    bankRules: { bankEvenDays: string; bankOddDays: string };
    rows: CashflowDayRow[];
    entries: any[];
  }> {
    await this.syncPosCardSalesToPayway();
    const bankRules = await this.getBankRules();

    // Generar ventana de 14 días (-4 días a +9 días desde hoy)
    const todayMs = Date.now();
    const dates: string[] = [];
    for (let offset = -4; offset <= 9; offset++) {
      const d = new Date(todayMs + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      dates.push(d);
    }

    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    // 1. Ventas de mostrador en efectivo/transferencia/MP por día
    const salesRows = await this.ctx.db
      .prepare(
        `SELECT substr(s.created_at, 1, 10) AS day_str, SUM(s.total_cents - s.refunded_cents) AS total_cents
         FROM sales s
         JOIN payment_methods pm ON pm.id = s.payment_method_id
         WHERE s.status IN ('completed', 'partially_returned')
           AND s.card_type IS NULL
           AND lower(pm.name) NOT LIKE '%tarjeta%'
           AND lower(pm.name) NOT LIKE '%cuenta corriente%'
           AND substr(s.created_at, 1, 10) >= ? AND substr(s.created_at, 1, 10) <= ?
         GROUP BY day_str`,
      )
      .bind(startDate, endDate)
      .all<{ day_str: string; total_cents: number }>();

    const salesByDay = new Map<string, number>();
    for (const r of salesRows.results || []) {
      salesByDay.set(r.day_str, r.total_cents);
    }

    // 2. Acreditaciones de Payway que caen en cada día (excluyendo las desconocidas o no figuradas)
    const paywayRows = await this.ctx.db
      .prepare(
        `SELECT expected_payout_date AS day_str, SUM(expected_net_cents) AS net_cents
         FROM payway_reconciliations
         WHERE reconciliation_status IN ('accredited', 'pending')
           AND expected_payout_date >= ? AND expected_payout_date <= ?
         GROUP BY expected_payout_date`,
      )
      .bind(startDate, endDate)
      .all<{ day_str: string; net_cents: number }>();

    const paywayByDay = new Map<string, number>();
    for (const r of paywayRows.results || []) {
      paywayByDay.set(r.day_str, r.net_cents);
    }

    // 3. Recibos de cuentas corrientes y cheques con fecha de cobro en ese día
    const receiptsRows = await this.ctx.db
      .prepare(
        `SELECT COALESCE(cheque_due_date, substr(created_at, 1, 10)) AS day_str, SUM(amount_cents) AS total_cents
         FROM customer_account_movements
         WHERE movement_type = 'receipt'
           AND COALESCE(cheque_due_date, substr(created_at, 1, 10)) >= ?
           AND COALESCE(cheque_due_date, substr(created_at, 1, 10)) <= ?
         GROUP BY day_str`,
      )
      .bind(startDate, endDate)
      .all<{ day_str: string; total_cents: number }>();

    const receiptsByDay = new Map<string, number>();
    for (const r of receiptsRows.results || []) {
      receiptsByDay.set(r.day_str, r.total_cents);
    }

    // 4. Movimientos manuales / programados de cashflow (fletes, proveedores, impuestos, otros)
    const cfRows = await this.ctx.db
      .prepare(
        `SELECT * FROM cashflow_entries
         WHERE entry_date >= ? AND entry_date <= ?
         ORDER BY entry_date ASC, id ASC`,
      )
      .bind(startDate, endDate)
      .all<any>();

    const entriesList = cfRows.results || [];

    // Construir matriz día por día tipo Excel con saldo arrastrado
    let runningBalanceCents = 45000000; // Base operativa inicial de caja ($450.000 ARS)
    const gridRows: CashflowDayRow[] = [];

    for (const dateStr of dates) {
      const dateObj = new Date(`${dateStr}T12:00:00.000Z`);
      const dayName = WEEKDAYS_ES[dateObj.getUTCDay()];
      const dayNum = parseInt(dateStr.slice(8, 10), 10) || 1;
      const monthStr = dateStr.slice(5, 7);
      const isEven = dayNum % 2 === 0;
      const dayParity = isEven ? 'par' : 'impar';
      const assignedBank = isEven ? bankRules.bankEvenDays : bankRules.bankOddDays;

      const openingBalanceCents = runningBalanceCents;
      const cashAndTransferSalesCents = salesByDay.get(dateStr) || 0;
      const paywaySettlementsCents = paywayByDay.get(dateStr) || 0;
      const currentAccountAndChequesInCents = receiptsByDay.get(dateStr) || 0;

      let otherIncomeCents = 0;
      let supplierAndFreightOutCents = 0;
      let taxesAndFixedOutCents = 0;
      const details: string[] = [];

      for (const e of entriesList) {
        if (e.entry_date !== dateStr) continue;
        details.push(`${e.direction === 'in' ? '+' : '-'} ${e.description}`);
        if (e.direction === 'in') {
          otherIncomeCents += e.amount_cents;
        } else {
          if (e.category === 'pago_proveedor' || e.category === 'flete_expreso') {
            supplierAndFreightOutCents += e.amount_cents;
          } else {
            taxesAndFixedOutCents += e.amount_cents;
          }
        }
      }

      const totalIn =
        cashAndTransferSalesCents +
        paywaySettlementsCents +
        currentAccountAndChequesInCents +
        otherIncomeCents;
      const totalOut = supplierAndFreightOutCents + taxesAndFixedOutCents;
      const netDailyFlowCents = totalIn - totalOut;
      const closingProjectedBalanceCents = openingBalanceCents + netDailyFlowCents;

      runningBalanceCents = closingProjectedBalanceCents;

      gridRows.push({
        date: dateStr,
        dayLabel: `${dayName} ${dayNum}/${monthStr}`,
        dayNumber: dayNum,
        dayParity,
        assignedBank,
        openingBalanceCents,
        cashAndTransferSalesCents,
        paywaySettlementsCents,
        currentAccountAndChequesInCents,
        otherIncomeCents,
        supplierAndFreightOutCents,
        taxesAndFixedOutCents,
        netDailyFlowCents,
        closingProjectedBalanceCents,
        details,
      });
    }

    return {
      bankRules,
      rows: gridRows,
      entries: entriesList,
    };
  }

  async createCashflowEntry(input: CashflowEntryCreateInput): Promise<void> {
    const now = nowIso();
    await this.ctx.db
      .prepare(
        `INSERT INTO cashflow_entries (
          entry_date, direction, category, description, bank_or_box, amount_cents, status, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.entryDate,
        input.direction,
        input.category,
        input.description.trim(),
        input.bankOrBox.trim(),
        input.amountCents,
        input.status,
        this.ctx.user.id,
        now,
      )
      .run();
  }

  /**
   * 2. Conciliación Payway, Sábana Bancaria (Días Pares vs Impares) y Alerta de Compras Desconocidas.
   */
  async getPaywayOverview(): Promise<{
    bankRules: { bankEvenDays: string; bankOddDays: string };
    summary: {
      evenBankTotalCents: number;
      oddBankTotalCents: number;
      accreditedTotalCents: number;
      pendingTotalCents: number;
      missingInPaywayCents: number;
      unknownPurchaseDisputeCents: number;
      disputesCount: number;
    };
    byCardBrandAndInstallments: {
      cardBrand: string;
      cardType: string;
      installments: number;
      count: number;
      grossCents: number;
      netCents: number;
    }[];
    items: PaywayReconciliationItem[];
  }> {
    await this.syncPosCardSalesToPayway();
    const bankRules = await this.getBankRules();

    const rows = await this.ctx.db
      .prepare('SELECT * FROM payway_reconciliations ORDER BY sale_date DESC, id DESC LIMIT 200')
      .all<any>();

    const items: PaywayReconciliationItem[] = (rows.results || []).map((r) => ({
      id: r.id,
      saleId: r.sale_id ?? null,
      saleDate: r.sale_date,
      dayParity: r.day_parity,
      assignedBank: r.assigned_bank,
      cardType: r.card_type,
      cardBrand: r.card_brand,
      installments: r.installments,
      grossAmountCents: r.gross_amount_cents,
      paywayFeeCents: r.payway_fee_cents,
      expectedNetCents: r.expected_net_cents,
      expectedPayoutDate: r.expected_payout_date,
      couponNumber: r.coupon_number ?? null,
      reconciliationStatus: r.reconciliation_status,
      disputeReason: r.dispute_reason ?? null,
      notes: r.notes ?? null,
      updatedAt: r.updated_at,
    }));

    let evenBankTotalCents = 0;
    let oddBankTotalCents = 0;
    let accreditedTotalCents = 0;
    let pendingTotalCents = 0;
    let missingInPaywayCents = 0;
    let unknownPurchaseDisputeCents = 0;
    let disputesCount = 0;

    const brandInstMap = new Map<
      string,
      {
        cardBrand: string;
        cardType: string;
        installments: number;
        count: number;
        grossCents: number;
        netCents: number;
      }
    >();

    for (const it of items) {
      if (it.dayParity === 'par') evenBankTotalCents += it.expectedNetCents;
      else oddBankTotalCents += it.expectedNetCents;

      if (it.reconciliationStatus === 'accredited') {
        accreditedTotalCents += it.expectedNetCents;
      } else if (it.reconciliationStatus === 'pending') {
        pendingTotalCents += it.expectedNetCents;
      } else if (it.reconciliationStatus === 'missing_in_payway') {
        missingInPaywayCents += it.grossAmountCents;
        disputesCount += 1;
      } else if (it.reconciliationStatus === 'unknown_purchase_dispute') {
        unknownPurchaseDisputeCents += it.grossAmountCents;
        disputesCount += 1;
      }

      const key = `${it.cardBrand}_${it.cardType}_${it.installments}`;
      const group = brandInstMap.get(key) || {
        cardBrand: it.cardBrand,
        cardType: it.cardType,
        installments: it.installments,
        count: 0,
        grossCents: 0,
        netCents: 0,
      };
      group.count += 1;
      group.grossCents += it.grossAmountCents;
      group.netCents += it.expectedNetCents;
      brandInstMap.set(key, group);
    }

    return {
      bankRules,
      summary: {
        evenBankTotalCents,
        oddBankTotalCents,
        accreditedTotalCents,
        pendingTotalCents,
        missingInPaywayCents,
        unknownPurchaseDisputeCents,
        disputesCount,
      },
      byCardBrandAndInstallments: Array.from(brandInstMap.values()).sort(
        (a, b) => b.grossCents - a.grossCents,
      ),
      items,
    };
  }

  async updatePaywayStatus(id: number, input: PaywayStatusUpdateInput): Promise<void> {
    const now = nowIso();
    await this.ctx.db
      .prepare(
        `UPDATE payway_reconciliations
         SET reconciliation_status = ?, dispute_reason = ?, notes = COALESCE(?, notes), updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.reconciliationStatus,
        input.disputeReason?.trim() || null,
        input.notes?.trim() || null,
        now,
        id,
      )
      .run();
  }

  /**
   * 3. Agenda Centralizada de WhatsApp (Ordenar Clientes y Proveedores para los teléfonos del local).
   */
  async getWhatsAppAgenda(): Promise<WhatsAppAgendaItem[]> {
    const custRows = await this.ctx.db
      .prepare(
        `SELECT c.id, c.name, c.customer_type, c.phone, c.cuit, c.city,
                (SELECT GROUP_CONCAT(COALESCE(v.brand, '') || ' ' || COALESCE(v.model, ''), ', ')
                 FROM customer_vehicles v WHERE v.customer_id = c.id) AS vehicles_str
         FROM customers c
         ORDER BY c.name ASC`,
      )
      .all<any>();

    const supRows = await this.ctx.db
      .prepare('SELECT id, name, phone, cuit, city, brands_supplied FROM suppliers WHERE active = 1 ORDER BY name ASC')
      .all<any>();

    const agenda: WhatsAppAgendaItem[] = [];

    for (const s of supRows.results || []) {
      const phone = s.phone || 'Sin teléfono';
      const norm = formatWhatsAppPhone(s.phone);
      const isProperlyNamed = /^[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(s.name.trim()) && s.name.trim().length > 3;
      agenda.push({
        key: `sup_${s.id}`,
        contactKind: 'supplier',
        entityId: s.id,
        rawName: s.name,
        formattedPhoneBookName: `PROV - ${s.name.trim()} (${s.city || 'Proveedor'})`,
        phone,
        normalizedWhatsApp: norm,
        cuit: s.cuit ?? null,
        city: s.city ?? null,
        detailTag: s.brands_supplied ? `Marcas: ${s.brands_supplied}` : 'Proveedor Oficial',
        isProperlyNamed,
      });
    }

    for (const c of custRows.results || []) {
      const phone = c.phone || 'Sin teléfono';
      const norm = formatWhatsAppPhone(c.phone);
      // Si el nombre es solo un número de teléfono, marcarlo como "Mal agendado / Solo número"
      const isJustNumber = /^\+?\d[\d\s-]{5,}$/.test(c.name.trim());
      const prefix = c.customer_type === 'empresa' ? 'EMP/TALLER' : 'CLI';
      agenda.push({
        key: `cust_${c.id}`,
        contactKind: 'customer',
        entityId: c.id,
        rawName: c.name,
        formattedPhoneBookName: `${prefix} - ${c.name.trim()} (${c.city || 'Bariloche'})`,
        phone,
        normalizedWhatsApp: norm,
        cuit: c.cuit ?? null,
        city: c.city ?? 'Bariloche',
        detailTag: c.vehicles_str ? `Vehículos: ${c.vehicles_str}` : c.customer_type === 'empresa' ? 'Empresa / Taller Activo' : 'Cliente Mostrador',
        isProperlyNamed: !isJustNumber && c.name.trim().length >= 3 && !!c.phone,
      });
    }

    return agenda;
  }

  /**
   * 4. Padrón del Parque Automotor (Estadística Marca, Modelo y Empresas Activas).
   */
  async getAutomotivePadronAndCompanies(): Promise<{
    padron: AutomotivePadronItem[];
    activeCompanies: ActiveCompanyStatItem[];
  }> {
    const padronRows = await this.ctx.db
      .prepare('SELECT * FROM automotive_padron ORDER BY sales_count DESC, active_units_est DESC')
      .all<any>();

    const padron: AutomotivePadronItem[] = (padronRows.results || []).map((r) => ({
      id: r.id,
      vehicleBrand: r.vehicle_brand,
      vehicleModel: r.vehicle_model,
      vehicleCategory: r.vehicle_category,
      yearsRange: r.years_range,
      commonBearings: r.common_bearings,
      activeUnitsEst: r.active_units_est,
      queriesCount: r.queries_count,
      salesCount: r.sales_count,
      notes: r.notes ?? null,
    }));

    const compRows = await this.ctx.db
      .prepare(
        `SELECT c.id, c.name, c.cuit, c.phone, c.city, c.customer_type,
                (SELECT COUNT(*) FROM customer_vehicles v WHERE v.customer_id = c.id) AS vehicles_count,
                (SELECT GROUP_CONCAT(COALESCE(v.brand, '') || ' ' || COALESCE(v.model, ''), ', ')
                 FROM customer_vehicles v WHERE v.customer_id = c.id) AS vehicles_summary,
                (SELECT COUNT(*) FROM quotes q WHERE q.customer_id = c.id OR lower(trim(q.customer_name)) = lower(trim(c.name))) AS quotes_count,
                COALESCE((SELECT SUM(s.total_cents) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed'), 0) +
                COALESCE((SELECT SUM(m.amount_cents) FROM customer_account_movements m WHERE lower(trim(m.customer_name)) = lower(trim(c.name)) AND m.movement_type = 'commitment'), 0) AS total_volume_cents
         FROM customers c
         WHERE c.customer_type = 'empresa'
            OR EXISTS (SELECT 1 FROM customer_account_movements m WHERE lower(trim(m.customer_name)) = lower(trim(c.name)))
         ORDER BY total_volume_cents DESC, quotes_count DESC
         LIMIT 50`,
      )
      .all<any>();

    const activeCompanies: ActiveCompanyStatItem[] = (compRows.results || []).map((r) => ({
      id: r.id,
      name: r.name,
      cuit: r.cuit ?? null,
      phone: r.phone ?? null,
      city: r.city ?? 'San Carlos de Bariloche',
      vehiclesCount: r.vehicles_count || 0,
      vehiclesSummary: r.vehicles_summary || 'Flota comercial / Taller mecánico',
      quotesCount: r.quotes_count || 0,
      salesAndAccountTotalCents: r.total_volume_cents || 0,
      isActiveCompany: true,
    }));

    return {
      padron,
      activeCompanies,
    };
  }

  async createAutomotivePadronEntry(input: AutomotivePadronCreateInput): Promise<AutomotivePadronItem> {
    const res = await this.ctx.db
      .prepare(
        `INSERT INTO automotive_padron (
          vehicle_brand, vehicle_model, vehicle_category, years_range,
          common_bearings, active_units_est, queries_count, sales_count, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      )
      .bind(
        input.vehicleBrand.trim(),
        input.vehicleModel.trim(),
        input.vehicleCategory.trim(),
        input.yearsRange.trim(),
        input.commonBearings.trim(),
        input.activeUnitsEst,
        input.notes?.trim() || null,
      )
      .run();

    const row = await this.ctx.db
      .prepare('SELECT * FROM automotive_padron WHERE id = ?')
      .bind(res.meta.last_row_id)
      .first<any>();

    return {
      id: row.id,
      vehicleBrand: row.vehicle_brand,
      vehicleModel: row.vehicle_model,
      vehicleCategory: row.vehicle_category,
      yearsRange: row.years_range,
      commonBearings: row.common_bearings,
      activeUnitsEst: row.active_units_est,
      queriesCount: row.queries_count,
      salesCount: row.sales_count,
      notes: row.notes ?? null,
    };
  }
}
