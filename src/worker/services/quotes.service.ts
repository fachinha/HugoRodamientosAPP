import type { ServiceContext } from '../env';
import { Errors } from '../lib/errors';
import { auditStmt, nowIso } from '../lib/db';
import {
  type QuoteCreateInput,
  type QuoteUpdateInput,
  type QuoteFollowUpUpdateInput,
  type QuoteListQuery,
  type QuoteDetail,
  type QuoteItemDetail,
  type QuoteStatus,
  formatQuoteNumber,
  isQuoteExpired,
} from '../../shared/quotes';
import { SalesService } from './sales.service';

export class QuotesService {
  constructor(private ctx: ServiceContext) {}

  /**
   * Genera el siguiente número correlativo disponible (ej: COT-00001).
   */
  private async getNextQuoteNumber(): Promise<string> {
    const row = await this.ctx.db
      .prepare('SELECT MAX(id) as max_id FROM quotes')
      .first<{ max_id: number | null }>();
    const nextId = (row?.max_id || 0) + 1;
    return formatQuoteNumber(nextId);
  }

  /**
   * Calcula importes financieros (subtotal, impuestos y total).
   */
  private calculateTotals(items: { unitPriceCents: number; quantity: number; discountPct?: number }[], includesTax: boolean) {
    let subtotalCents = 0;
    for (const it of items) {
      const disc = Math.min(100, Math.max(0, it.discountPct || 0));
      const lineTotal = Math.round(it.unitPriceCents * it.quantity * (1 - disc / 100));
      subtotalCents += lineTotal;
    }

    let taxCents = 0;
    let totalCents = subtotalCents;

    if (includesTax) {
      // Precios finales con IVA incluido: desglosamos el 21% correspondiente para fines informativos
      taxCents = Math.round(subtotalCents - subtotalCents / 1.21);
      totalCents = subtotalCents;
    } else {
      // Precios netos: se suma el 21% de IVA
      taxCents = Math.round(subtotalCents * 0.21);
      totalCents = subtotalCents + taxCents;
    }

    return { subtotalCents, taxCents, totalCents };
  }

  private async resolveOrCreateCustomer(input: QuoteCreateInput, now: string): Promise<number | null> {
    const cleanName = input.customerName.trim();
    if (!cleanName) return null;

    let customerId: number | null = input.customerId ?? null;

    if (customerId) {
      const exists = await this.ctx.db
        .prepare('SELECT id FROM customers WHERE id = ?')
        .bind(customerId)
        .first<{ id: number }>();
      if (!exists) customerId = null;
    }

    if (!customerId && input.customerCuit?.trim()) {
      const byCuit = await this.ctx.db
        .prepare('SELECT id FROM customers WHERE trim(cuit) = trim(?) LIMIT 1')
        .bind(input.customerCuit.trim())
        .first<{ id: number }>();
      if (byCuit) customerId = byCuit.id;
    }

    if (!customerId) {
      const byName = await this.ctx.db
        .prepare('SELECT id FROM customers WHERE lower(trim(name)) = lower(trim(?)) LIMIT 1')
        .bind(cleanName)
        .first<{ id: number }>();
      if (byName) customerId = byName.id;
    }

    if (customerId) {
      await this.ctx.db
        .prepare(
          `UPDATE customers SET
             phone = COALESCE(NULLIF(?, ''), phone),
             cuit = COALESCE(NULLIF(?, ''), cuit),
             email = COALESCE(NULLIF(?, ''), email),
             updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          input.customerPhone?.trim() || '',
          input.customerCuit?.trim() || '',
          input.customerEmail?.trim() || '',
          now,
          customerId,
        )
        .run();
    } else {
      const ins = await this.ctx.db
        .prepare(
          `INSERT INTO customers (name, customer_type, phone, cuit, email, city, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'San Carlos de Bariloche', 'Registrado desde Presupuestos', ?, ?)`,
        )
        .bind(
          cleanName,
          input.customerType || 'particular',
          input.customerPhone?.trim() || null,
          input.customerCuit?.trim() || null,
          input.customerEmail?.trim() || null,
          now,
          now,
        )
        .run();
      customerId = ins.meta.last_row_id;
    }

    const plate = input.vehiclePlate?.trim().toUpperCase() || null;
    const vBrand = input.vehicleBrand?.trim() || null;
    const vModel = input.vehicleModel?.trim() || null;

    if (customerId && (plate || vModel)) {
      const existingVeh = plate
        ? await this.ctx.db
            .prepare('SELECT id FROM customer_vehicles WHERE customer_id = ? AND upper(trim(plate)) = ? LIMIT 1')
            .bind(customerId, plate)
            .first<{ id: number }>()
        : await this.ctx.db
            .prepare("SELECT id FROM customer_vehicles WHERE customer_id = ? AND lower(trim(COALESCE(model, ''))) = lower(?) LIMIT 1")
            .bind(customerId, vModel || '')
            .first<{ id: number }>();

      if (!existingVeh) {
        await this.ctx.db
          .prepare(
            `INSERT INTO customer_vehicles (customer_id, brand, model, year, engine, plate, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            customerId,
            vBrand,
            vModel,
            input.vehicleYear ?? null,
            input.vehicleEngine?.trim() || null,
            plate,
            now,
          )
          .run();
      }
    }

    return customerId;
  }

  /**
   * Crea una nueva cotización / presupuesto.
   */
  async createQuote(input: QuoteCreateInput): Promise<QuoteDetail> {
    const now = nowIso();
    const quoteNumber = await this.getNextQuoteNumber();
    const resolvedCustomerId = await this.resolveOrCreateCustomer(input, now);

    const { subtotalCents, taxCents, totalCents } = this.calculateTotals(input.items, input.includesTax);

    // Fecha límite de validez
    const validUntilDate = new Date(Date.now() + input.validDays * 24 * 60 * 60 * 1000);
    const validUntil = validUntilDate.toISOString().slice(0, 10);

    // Obtener número de vendedor del usuario actual si no se especificó
    const userRow = await this.ctx.db
      .prepare('SELECT seller_number FROM users WHERE id = ?')
      .bind(this.ctx.user.id)
      .first<{ seller_number: string | null }>();
    const sellerNumber = input.sellerNumber?.trim() || userRow?.seller_number || `V-0${this.ctx.user.id}`;
    const trackingNumber = input.trackingNumber?.trim() || quoteNumber.replace('COT-', 'SEG-');

    const insertResult = await this.ctx.db
      .prepare(
        `INSERT INTO quotes (
          quote_number, user_id, customer_id, customer_name, customer_phone, customer_cuit, customer_email,
          customer_type, vehicle_brand, vehicle_model, vehicle_year, vehicle_engine, vehicle_plate,
          subtotal_cents, discount_cents, tax_cents, total_cents, includes_tax,
          valid_days, valid_until, payment_terms, notes,
          seller_number, tracking_number, follow_up_status, loss_reason, follow_up_notes,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      )
      .bind(
        quoteNumber,
        this.ctx.user.id,
        resolvedCustomerId,
        input.customerName.trim(),
        input.customerPhone?.trim() || null,
        input.customerCuit?.trim() || null,
        input.customerEmail?.trim() || null,
        input.customerType,
        input.vehicleBrand?.trim() || null,
        input.vehicleModel?.trim() || null,
        input.vehicleYear ?? null,
        input.vehicleEngine?.trim() || null,
        input.vehiclePlate?.trim() ? input.vehiclePlate.trim().toUpperCase() : null,
        subtotalCents,
        taxCents,
        totalCents,
        input.includesTax ? 1 : 0,
        input.validDays,
        validUntil,
        input.paymentTerms.trim(),
        input.notes?.trim() || null,
        sellerNumber,
        trackingNumber,
        input.followUpStatus || 'pending',
        input.lossReason?.trim() || null,
        input.followUpNotes?.trim() || null,
        now,
        now,
      )
      .run();

    const quoteId = insertResult.meta.last_row_id;

    // Insertar ítems
    const itemStmts: any[] = [];
    for (let i = 0; i < input.items.length; i++) {
      const it = input.items[i];
      const disc = Math.min(100, Math.max(0, it.discountPct || 0));
      const lineTotal = Math.round(it.unitPriceCents * it.quantity * (1 - disc / 100));

      itemStmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO quote_items (
              quote_id, product_id, sku, description, brand,
              unit_price_cents, quantity, discount_pct, line_total_cents, availability, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            quoteId,
            it.productId ?? null,
            it.sku?.trim() || null,
            it.description.trim(),
            it.brand?.trim() || null,
            it.unitPriceCents,
            it.quantity,
            disc,
            lineTotal,
            it.availability || 'in_stock',
            i,
          ),
      );
    }

    // Auditoría
    itemStmts.push(
      auditStmt(this.ctx, 'quote.create', 'quotes', quoteId, {
        quoteNumber,
        customerName: input.customerName,
        totalCents,
      }),
    );

    await this.ctx.db.batch(itemStmts);

    return (await this.getQuoteById(quoteId))!;
  }

  /**
   * Actualiza una cotización existente.
   */
  async updateQuote(id: number, input: QuoteUpdateInput): Promise<QuoteDetail> {
    const existing = await this.getQuoteById(id);
    if (!existing) {
      throw Errors.notFound(`La cotización id ${id}`);
    }

    if (existing.status === 'converted') {
      throw Errors.badRequest('No se puede modificar una cotización que ya fue convertida a venta.');
    }

    const now = nowIso();
    const resolvedCustomerId = await this.resolveOrCreateCustomer(input, now);
    const { subtotalCents, taxCents, totalCents } = this.calculateTotals(input.items, input.includesTax);

    const validUntilDate = new Date(Date.now() + input.validDays * 24 * 60 * 60 * 1000);
    const validUntil = validUntilDate.toISOString().slice(0, 10);
    const newStatus = input.status || existing.status;

    await this.ctx.db
      .prepare(
        `UPDATE quotes SET
          customer_id = COALESCE(?, customer_id),
          customer_name = ?, customer_phone = ?, customer_cuit = ?, customer_email = ?,
          customer_type = ?, vehicle_brand = ?, vehicle_model = ?, vehicle_year = ?,
          vehicle_engine = ?, vehicle_plate = ?, subtotal_cents = ?, tax_cents = ?,
          total_cents = ?, includes_tax = ?, valid_days = ?, valid_until = ?,
          payment_terms = ?, notes = ?,
          seller_number = COALESCE(?, seller_number),
          tracking_number = COALESCE(?, tracking_number),
          follow_up_status = COALESCE(?, follow_up_status),
          loss_reason = ?,
          follow_up_notes = ?,
          status = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        resolvedCustomerId,
        input.customerName.trim(),
        input.customerPhone?.trim() || null,
        input.customerCuit?.trim() || null,
        input.customerEmail?.trim() || null,
        input.customerType,
        input.vehicleBrand?.trim() || null,
        input.vehicleModel?.trim() || null,
        input.vehicleYear ?? null,
        input.vehicleEngine?.trim() || null,
        input.vehiclePlate?.trim() ? input.vehiclePlate.trim().toUpperCase() : null,
        subtotalCents,
        taxCents,
        totalCents,
        input.includesTax ? 1 : 0,
        input.validDays,
        validUntil,
        input.paymentTerms.trim(),
        input.notes?.trim() || null,
        input.sellerNumber?.trim() || null,
        input.trackingNumber?.trim() || null,
        input.followUpStatus || null,
        input.lossReason !== undefined ? input.lossReason?.trim() || null : existing.lossReason,
        input.followUpNotes !== undefined ? input.followUpNotes?.trim() || null : existing.followUpNotes,
        newStatus,
        now,
        id,
      )
      .run();

    // Reemplazar ítems
    const stmts: any[] = [
      this.ctx.db.prepare('DELETE FROM quote_items WHERE quote_id = ?').bind(id),
    ];

    for (let i = 0; i < input.items.length; i++) {
      const it = input.items[i];
      const disc = Math.min(100, Math.max(0, it.discountPct || 0));
      const lineTotal = Math.round(it.unitPriceCents * it.quantity * (1 - disc / 100));

      stmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO quote_items (
              quote_id, product_id, sku, description, brand,
              unit_price_cents, quantity, discount_pct, line_total_cents, availability, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            it.productId ?? null,
            it.sku?.trim() || null,
            it.description.trim(),
            it.brand?.trim() || null,
            it.unitPriceCents,
            it.quantity,
            disc,
            lineTotal,
            it.availability || 'in_stock',
            i,
          ),
      );
    }

    stmts.push(
      auditStmt(this.ctx, 'quote.update', 'quotes', id, {
        quoteNumber: existing.quoteNumber,
        customerName: input.customerName,
        totalCents,
        status: newStatus,
      }),
    );

    await this.ctx.db.batch(stmts);

    return (await this.getQuoteById(id))!;
  }

  /**
   * Obtiene una cotización completa por su ID.
   */
  async getQuoteById(id: number): Promise<QuoteDetail | null> {
    const q = await this.ctx.db
      .prepare(
        `SELECT q.*, u.display_name as user_name
         FROM quotes q
         JOIN users u ON u.id = q.user_id
         WHERE q.id = ?
         LIMIT 1`,
      )
      .bind(id)
      .first<any>();

    if (!q) return null;

    const itemsRows = await this.ctx.db
      .prepare(
        `SELECT * FROM quote_items
         WHERE quote_id = ?
         ORDER BY sort_order ASC, id ASC`,
      )
      .bind(id)
      .all<any>();

    const items: QuoteItemDetail[] = (itemsRows.results || []).map((r) => ({
      id: r.id,
      quoteId: r.quote_id,
      productId: r.product_id,
      sku: r.sku,
      description: r.description,
      brand: r.brand,
      unitPriceCents: r.unit_price_cents,
      quantity: r.quantity,
      discountPct: r.discount_pct,
      lineTotalCents: r.line_total_cents,
      availability: r.availability,
      sortOrder: r.sort_order,
    }));

    const expired = isQuoteExpired(q.valid_until) && q.status !== 'converted';

    return {
      id: q.id,
      quoteNumber: q.quote_number,
      userId: q.user_id,
      userName: q.user_name || 'Vendedor',
      customerId: q.customer_id ?? null,
      customerName: q.customer_name,
      customerPhone: q.customer_phone,
      customerCuit: q.customer_cuit,
      customerEmail: q.customer_email,
      customerType: q.customer_type,
      vehicleBrand: q.vehicle_brand,
      vehicleModel: q.vehicle_model,
      vehicleYear: q.vehicle_year,
      vehicleEngine: q.vehicle_engine,
      vehiclePlate: q.vehicle_plate,
      subtotalCents: q.subtotal_cents,
      discountCents: q.discount_cents,
      taxCents: q.tax_cents,
      totalCents: q.total_cents,
      includesTax: q.includes_tax === 1,
      validDays: q.valid_days,
      validUntil: q.valid_until,
      isExpired: expired,
      paymentTerms: q.payment_terms,
      notes: q.notes,
      sellerNumber: q.seller_number || `V-0${q.user_id}`,
      trackingNumber: q.tracking_number || `SEG-${String(q.id).padStart(5, '0')}`,
      followUpStatus: q.follow_up_status || 'pending',
      lossReason: q.loss_reason || null,
      followUpNotes: q.follow_up_notes || null,
      status: q.status,
      convertedSaleId: q.converted_sale_id,
      createdAt: q.created_at,
      updatedAt: q.updated_at,
      items,
    };
  }

  /**
   * Actualiza el seguimiento comercial de un presupuesto (N° seguimiento, N° vendedor, si fue acreditado/viable o motivo de no venta).
   */
  async updateFollowUp(id: number, input: QuoteFollowUpUpdateInput): Promise<QuoteDetail> {
    const existing = await this.getQuoteById(id);
    if (!existing) {
      throw Errors.notFound(`La cotización id ${id}`);
    }

    const now = nowIso();
    let nextStatus = existing.status;
    if (existing.status !== 'converted') {
      if (input.followUpStatus === 'accredited') nextStatus = 'accepted';
      else if (input.followUpStatus === 'not_viable') nextStatus = 'rejected';
      else if (input.followUpStatus === 'following' && existing.status === 'draft') nextStatus = 'sent';
    }

    await this.ctx.db
      .prepare(
        `UPDATE quotes SET
           seller_number = COALESCE(?, seller_number),
           tracking_number = COALESCE(?, tracking_number),
           follow_up_status = ?,
           loss_reason = ?,
           follow_up_notes = ?,
           status = ?,
           updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.sellerNumber?.trim() || null,
        input.trackingNumber?.trim() || null,
        input.followUpStatus,
        input.lossReason?.trim() || null,
        input.followUpNotes?.trim() || null,
        nextStatus,
        now,
        id,
      )
      .run();

    await auditStmt(this.ctx, 'quote.follow_up_update', 'quotes', id, {
      quoteNumber: existing.quoteNumber,
      followUpStatus: input.followUpStatus,
      lossReason: input.lossReason,
    }).run();

    return (await this.getQuoteById(id))!;
  }

  /**
   * Actualiza el estado de una cotización (ej: 'sent', 'accepted', 'rejected').
   */
  async updateStatus(id: number, status: QuoteStatus): Promise<QuoteDetail> {
    const existing = await this.getQuoteById(id);
    if (!existing) {
      throw Errors.notFound(`La cotización id ${id}`);
    }

    if (existing.status === 'converted' && status !== 'converted') {
      throw Errors.badRequest('No se puede cambiar el estado de una cotización ya convertida a venta.');
    }

    const now = nowIso();
    await this.ctx.db
      .prepare('UPDATE quotes SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, now, id)
      .run();

    return (await this.getQuoteById(id))!;
  }

  /**
   * Lista cotizaciones con filtros, búsqueda ágil y métricas.
   */
  async listQuotes(query: QuoteListQuery): Promise<{
    items: QuoteDetail[];
    total: number;
    page: number;
    pageSize: number;
    metrics: {
      totalQuotes: number;
      activeQuotes: number;
      expiredQuotes: number;
      convertedQuotes: number;
      pendingCount: number;
      followingCount: number;
      accreditedCount: number;
      notViableCount: number;
      lossReasonsBreakdown: { reason: string; count: number }[];
    };
  }> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const offset = (page - 1) * pageSize;
    const today = new Date().toISOString().slice(0, 10);

    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    if (query.q && query.q.trim()) {
      const term = `%${query.q.trim()}%`;
      whereClauses.push(
        `(q.quote_number LIKE ? OR q.customer_name LIKE ? OR q.vehicle_plate LIKE ? OR q.vehicle_model LIKE ? OR q.customer_phone LIKE ? OR q.tracking_number LIKE ? OR q.seller_number LIKE ?)`,
      );
      params.push(term, term, term, term, term, term, term);
    }

    if (query.status && query.status !== 'all') {
      if (query.status === 'expired') {
        whereClauses.push(`q.valid_until < ? AND q.status != 'converted'`);
        params.push(today);
      } else {
        whereClauses.push(`q.status = ?`);
        params.push(query.status);
      }
    }

    if (query.followUpStatus && query.followUpStatus !== 'all') {
      whereClauses.push(`q.follow_up_status = ?`);
      params.push(query.followUpStatus);
    }

    if (query.from) {
      whereClauses.push(`q.created_at >= ?`);
      params.push(`${query.from}T00:00:00.000Z`);
    }

    if (query.to) {
      whereClauses.push(`q.created_at <= ?`);
      params.push(`${query.to}T23:59:59.999Z`);
    }

    const whereSql = whereClauses.join(' AND ');

    // Total coincidente
    const countRow = await this.ctx.db
      .prepare(`SELECT COUNT(*) as total FROM quotes q WHERE ${whereSql}`)
      .bind(...params)
      .first<{ total: number }>();
    const total = countRow?.total || 0;

    // Métricas globales y de embudo de seguimiento
    const metricsRow = await this.ctx.db
      .prepare(
        `SELECT
           COUNT(*) as totalQuotes,
           SUM(CASE WHEN status != 'converted' AND valid_until >= ? THEN 1 ELSE 0 END) as activeQuotes,
           SUM(CASE WHEN status != 'converted' AND valid_until < ? THEN 1 ELSE 0 END) as expiredQuotes,
           SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as convertedQuotes,
           SUM(CASE WHEN follow_up_status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
           SUM(CASE WHEN follow_up_status = 'following' THEN 1 ELSE 0 END) as followingCount,
           SUM(CASE WHEN follow_up_status = 'accredited' OR status = 'converted' THEN 1 ELSE 0 END) as accreditedCount,
           SUM(CASE WHEN follow_up_status = 'not_viable' OR status = 'rejected' THEN 1 ELSE 0 END) as notViableCount
         FROM quotes`,
      )
      .bind(today, today)
      .first<{
        totalQuotes: number;
        activeQuotes: number;
        expiredQuotes: number;
        convertedQuotes: number;
        pendingCount: number;
        followingCount: number;
        accreditedCount: number;
        notViableCount: number;
      }>();

    const lossRows = await this.ctx.db
      .prepare(
        `SELECT COALESCE(loss_reason, 'Sin motivo especificado') as reason, COUNT(*) as count
         FROM quotes
         WHERE follow_up_status = 'not_viable' OR status = 'rejected'
         GROUP BY COALESCE(loss_reason, 'Sin motivo especificado')
         ORDER BY count DESC`,
      )
      .all<{ reason: string; count: number }>();

    // Registros de la página
    const rows = await this.ctx.db
      .prepare(
        `SELECT q.*, u.display_name as user_name
         FROM quotes q
         JOIN users u ON u.id = q.user_id
         WHERE ${whereSql}
         ORDER BY q.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, offset)
      .all<any>();

    // Cargar ítems para cada cotización de la página
    const quoteIds = (rows.results || []).map((r) => r.id);
    const itemsByQuote = new Map<number, QuoteItemDetail[]>();

    if (quoteIds.length > 0) {
      const placeholders = quoteIds.map(() => '?').join(',');
      const itemRows = await this.ctx.db
        .prepare(
          `SELECT * FROM quote_items
           WHERE quote_id IN (${placeholders})
           ORDER BY sort_order ASC, id ASC`,
        )
        .bind(...quoteIds)
        .all<any>();

      for (const r of itemRows.results || []) {
        const list = itemsByQuote.get(r.quote_id) || [];
        list.push({
          id: r.id,
          quoteId: r.quote_id,
          productId: r.product_id,
          sku: r.sku,
          description: r.description,
          brand: r.brand,
          unitPriceCents: r.unit_price_cents,
          quantity: r.quantity,
          discountPct: r.discount_pct,
          lineTotalCents: r.line_total_cents,
          availability: r.availability,
          sortOrder: r.sort_order,
        });
        itemsByQuote.set(r.quote_id, list);
      }
    }

    const items: QuoteDetail[] = (rows.results || []).map((q) => ({
      id: q.id,
      quoteNumber: q.quote_number,
      userId: q.user_id,
      userName: q.user_name || 'Vendedor',
      customerId: q.customer_id ?? null,
      customerName: q.customer_name,
      customerPhone: q.customer_phone,
      customerCuit: q.customer_cuit,
      customerEmail: q.customer_email,
      customerType: q.customer_type,
      vehicleBrand: q.vehicle_brand,
      vehicleModel: q.vehicle_model,
      vehicleYear: q.vehicle_year,
      vehicleEngine: q.vehicle_engine,
      vehiclePlate: q.vehicle_plate,
      subtotalCents: q.subtotal_cents,
      discountCents: q.discount_cents,
      taxCents: q.tax_cents,
      totalCents: q.total_cents,
      includesTax: q.includes_tax === 1,
      validDays: q.valid_days,
      validUntil: q.valid_until,
      isExpired: isQuoteExpired(q.valid_until) && q.status !== 'converted',
      paymentTerms: q.payment_terms,
      notes: q.notes,
      sellerNumber: q.seller_number || `V-0${q.user_id}`,
      trackingNumber: q.tracking_number || `SEG-${String(q.id).padStart(5, '0')}`,
      followUpStatus: q.follow_up_status || 'pending',
      lossReason: q.loss_reason || null,
      followUpNotes: q.follow_up_notes || null,
      status: q.status,
      convertedSaleId: q.converted_sale_id,
      createdAt: q.created_at,
      updatedAt: q.updated_at,
      items: itemsByQuote.get(q.id) || [],
    }));

    return {
      items,
      total,
      page,
      pageSize,
      metrics: {
        totalQuotes: metricsRow?.totalQuotes || 0,
        activeQuotes: metricsRow?.activeQuotes || 0,
        expiredQuotes: metricsRow?.expiredQuotes || 0,
        convertedQuotes: metricsRow?.convertedQuotes || 0,
        pendingCount: metricsRow?.pendingCount || 0,
        followingCount: metricsRow?.followingCount || 0,
        accreditedCount: metricsRow?.accreditedCount || 0,
        notViableCount: metricsRow?.notViableCount || 0,
        lossReasonsBreakdown: lossRows.results || [],
      },
    };
  }

  /**
   * Convierte una cotización aceptada en una venta de mostrador con descuento de stock.
   */
  async convertToSale(id: number, paymentMethodId: number): Promise<{ saleId: number; quote: QuoteDetail }> {
    const quote = await this.getQuoteById(id);
    if (!quote) {
      throw Errors.notFound(`La cotización id ${id}`);
    }

    if (quote.status === 'converted') {
      throw Errors.badRequest(`Esta cotización ya fue convertida a la venta #${quote.convertedSaleId}.`);
    }

    const now = nowIso();

    // 1. Resolver los productIds para cada ítem
    const saleItemsInput: { productId: number; quantity: number; expectedUnitPriceCents: number }[] = [];

    for (const it of quote.items) {
      let prodId = it.productId;

      // Si el ítem no tiene producto asociado en catálogo, creamos uno al vuelo
      if (!prodId) {
        const generatedSku = it.sku || `COT-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
        const prodInsert = await this.ctx.db
          .prepare(
            `INSERT INTO products (
              sku, name, brand, category_id, unit, price_cents, cost_cents, stock, min_stock, active, created_at, updated_at
            ) VALUES (?, ?, ?, NULL, 'unidad', ?, NULL, ?, NULL, 1, ?, ?)`,
          )
          .bind(
            generatedSku,
            it.description.trim(),
            it.brand?.trim() || null,
            it.unitPriceCents,
            it.quantity, // Stock inicial suficiente para la venta inmediata
            now,
            now,
          )
          .run();
        prodId = prodInsert.meta.last_row_id;
      }

      saleItemsInput.push({
        productId: prodId,
        quantity: it.quantity,
        expectedUnitPriceCents: it.unitPriceCents,
      });
    }

    // 2. Crear la venta mediante el SalesService oficial
    const salesService = new SalesService(this.ctx);
    const idempotencyKey = `quote_conv_${id}_${Date.now()}`;

    const sale = await salesService.createSale({
      idempotencyKey,
      paymentMethodId,
      discountCents: quote.discountCents,
      notes: `Venta originada de Presupuesto ${quote.quoteNumber} (${quote.customerName}${quote.vehiclePlate ? ` - ${quote.vehiclePlate}` : ''})`,
      items: saleItemsInput,
    });

    // 3. Marcar la cotización como convertida y acreditada, y vincular el cliente a la venta
    const updateBatch = [
      this.ctx.db
        .prepare('UPDATE quotes SET status = ?, follow_up_status = ?, converted_sale_id = ?, updated_at = ? WHERE id = ?')
        .bind('converted', 'accredited', sale.id, now, id),
    ];
    if (quote.customerId) {
      updateBatch.push(
        this.ctx.db
          .prepare('UPDATE sales SET customer_id = ? WHERE id = ?')
          .bind(quote.customerId, sale.id),
      );
    }
    await this.ctx.db.batch(updateBatch);

    // Auditoría
    await auditStmt(this.ctx, 'quote.convert_to_sale', 'quotes', id, {
      quoteNumber: quote.quoteNumber,
      saleId: sale.id,
      totalCents: sale.totalCents,
    }).run();


    const updatedQuote = (await this.getQuoteById(id))!;
    return { saleId: sale.id, quote: updatedQuote };
  }
}
