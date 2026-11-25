import type { ServiceContext } from '../env';
import type { SaleCreateInput } from '../../shared/schemas';
import { Errors, isConstraintError } from '../lib/errors';
import { auditStmt, nowIso } from '../lib/db';
import { subtotal, refundAmount, formatSaleNumber } from '../../shared/sales';

export interface SaleDetail {
  id: number;
  saleNumber: string;
  idempotencyKey: string;
  userId: number;
  userName: string;
  customerId?: number | null;
  customerName?: string | null;
  paymentMethodId: number;
  paymentMethodName: string;
  subtotalCents: number;
  discountCents: number;
  surchargeCents: number;
  installments: number;
  cardType?: 'debito' | 'credito' | null;
  cardBrand?: string | null;
  exchangeRateUsd: number | null;
  totalCents: number;
  refundedCents: number;
  status: 'completed' | 'partially_returned' | 'returned' | 'voided';
  notes: string | null;
  createdAt: string;
  items: {
    id: number;
    productId: number;
    sku: string;
    name: string;
    unitPriceCents: number;
    unitCostCents?: number | null;
    quantity: number;
    lineTotalCents: number;
    returnedQty: number;
    isManual?: boolean;
    manualReason?: string | null;
  }[];
}

export class SalesService {
  constructor(private ctx: ServiceContext) {}

  /**
   * Crea una venta de forma atómica:
   * 1. Comprueba idempotencia (evita doble venta ante reintentos o doble clic).
   * 2. Recalcula importes y valida precios y stock vigente en el servidor.
   * 3. Ejecuta INSERT de venta, sale_items, UPDATE de stock y stock_movements en un solo db.batch().
   * 4. Si el stock no alcanza, la restricción CHECK(stock >= 0) revierte todo el batch automáticamente.
   */
  async createSale(input: SaleCreateInput): Promise<SaleDetail> {
    const {
      idempotencyKey,
      paymentMethodId,
      customerId = null,
      discountCents = 0,
      surchargeCents = 0,
      installments = 1,
      cardType = null,
      cardBrand = null,
      exchangeRateUsd = null,
      supervisorAuthorized = false,
      supervisorAuthorizedBy = null,
      notes,
      items,
    } = input;

    // 1. Idempotencia: si ya existe la venta con esa clave, la devolvemos inmediatamente
    const existing = await this.ctx.db
      .prepare('SELECT id FROM sales WHERE idempotency_key = ?')
      .bind(idempotencyKey)
      .first<{ id: number }>();

    if (existing) {
      return (await this.getSaleById(existing.id))!;
    }

    // 2. Verificar medio de pago
    const pm = await this.ctx.db
      .prepare('SELECT id, name, active FROM payment_methods WHERE id = ?')
      .bind(paymentMethodId)
      .first<{ id: number; name: string; active: number }>();

    if (!pm || pm.active !== 1) {
      throw Errors.badRequest('El medio de pago seleccionado no es válido o está inactivo.');
    }

    const now = nowIso();

    // 3. Consultar productos de catálogo actuales en la base de datos
    const catalogProductIds = items.filter((i) => !i.isManual && i.productId).map((i) => i.productId as number);
    const prodMap = new Map<
      number,
      { id: number; sku: string; name: string; price_cents: number; cost_cents: number | null; stock: number; active: number }
    >();

    if (catalogProductIds.length > 0) {
      const placeholders = catalogProductIds.map(() => '?').join(',');
      const dbProducts = await this.ctx.db
        .prepare(
          `SELECT id, sku, name, price_cents, cost_cents, stock, active
           FROM products
           WHERE id IN (${placeholders})`,
        )
        .bind(...catalogProductIds)
        .all<{ id: number; sku: string; name: string; price_cents: number; cost_cents: number | null; stock: number; active: number }>();

      for (const p of dbProducts.results) {
        prodMap.set(p.id, p);
      }
    }

    // 4. Procesar ítems de catálogo e ítems de carga manual
    const pricedLines: {
      product: { id: number; sku: string; name: string; price_cents: number; cost_cents: number | null; stock: number; active: number };
      quantity: number;
      unitPriceCents: number;
      unitCostCents: number | null;
      lineTotalCents: number;
      isManual: boolean;
      manualReason: string | null;
    }[] = [];

    for (const item of items) {
      if (item.isManual) {
        const manualDesc = (item.manualDescription || 'Repuesto fuera de catálogo').trim();
        const manualReason = (item.manualReason || 'Carga manual en mostrador').trim();
        const manualBrand = item.manualBrand?.trim() || null;
        const manualSku = `MAN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

        const insertManualProd = await this.ctx.db
          .prepare(
            `INSERT INTO products (
              sku, name, description, brand, unit, price_cents, cost_cents, stock, min_stock, active,
              supplier_name, last_movement_at, last_sale_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'unidad', ?, NULL, ?, 0, 1, ?, ?, ?, ?, ?)`,
          )
          .bind(
            manualSku,
            manualDesc,
            `[CARGA MANUAL POS] Motivo: ${manualReason}`,
            manualBrand,
            item.expectedUnitPriceCents,
            item.quantity,
            manualReason,
            now,
            now,
            now,
            now,
          )
          .run();

        const manualProductId = insertManualProd.meta.last_row_id;
        pricedLines.push({
          product: {
            id: manualProductId,
            sku: manualSku,
            name: manualDesc,
            price_cents: item.expectedUnitPriceCents,
            cost_cents: null,
            stock: item.quantity,
            active: 1,
          },
          quantity: item.quantity,
          unitPriceCents: item.expectedUnitPriceCents,
          unitCostCents: null,
          lineTotalCents: item.expectedUnitPriceCents * item.quantity,
          isManual: true,
          manualReason,
        });
      } else {
        const prod = prodMap.get(item.productId!);
        if (!prod) {
          throw Errors.notFound(`El producto ID ${item.productId}`);
        }
        if (prod.active !== 1) {
          throw Errors.badRequest(`El producto "${prod.name}" (${prod.sku}) está inactivo y no puede venderse.`);
        }
        if (prod.price_cents !== item.expectedUnitPriceCents) {
          throw Errors.conflict(
            'PRICE_CHANGED',
            `El precio de "${prod.name}" cambió de $ ${(item.expectedUnitPriceCents / 100).toFixed(2)} a $ ${(prod.price_cents / 100).toFixed(2)}. Revisá el carrito.`,
            { productId: prod.id, oldPriceCents: item.expectedUnitPriceCents, newPriceCents: prod.price_cents },
          );
        }
        if (prod.stock < item.quantity) {
          throw Errors.conflict(
            'INSUFFICIENT_STOCK',
            `Stock insuficiente para "${prod.name}". Solicitado: ${item.quantity}, disponible en mostrador: ${prod.stock}.`,
            { productId: prod.id, available: prod.stock, requested: item.quantity },
          );
        }

        pricedLines.push({
          product: prod,
          quantity: item.quantity,
          unitPriceCents: prod.price_cents,
          unitCostCents: prod.cost_cents ?? null,
          lineTotalCents: prod.price_cents * item.quantity,
          isManual: false,
          manualReason: null,
        });
      }
    }

    const calculatedSubtotal = subtotal(
      pricedLines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity })),
    );

    if (discountCents > calculatedSubtotal) {
      throw Errors.badRequest('El descuento no puede superar el subtotal de la venta.');
    }

    // Validar permisos sobre descuento (tope de vendedor: 5% por defecto, salvo autorización de supervisor)
    if (discountCents > 0 && this.ctx.user.role !== 'admin' && !supervisorAuthorized) {
      const maxDiscountRow = await this.ctx.db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .bind('max_seller_discount_pct')
        .first<{ value: string }>();
      const maxPct = maxDiscountRow ? Number(JSON.parse(maxDiscountRow.value)) : 5;
      const appliedPct = (discountCents / calculatedSubtotal) * 100;
      if (appliedPct > maxPct + 0.01) {
        throw Errors.forbidden(
          `Los vendedores pueden autorizar hasta un ${maxPct}% de descuento. Descuento solicitado: ${appliedPct.toFixed(1)}%. Pedile autorización al Supervisor de Ventas.`,
        );
      }
    }

    const calculatedTotal = calculatedSubtotal - discountCents + surchargeCents;
    const requestHash = `hash_${items.length}_${calculatedTotal}`;
    const finalNotes =
      supervisorAuthorized && supervisorAuthorizedBy
        ? `${notes ? notes + ' · ' : ''}[Dto. autorizado por Supervisor: ${supervisorAuthorizedBy}]`
        : notes ?? null;

    // Paso 1: Insertar la venta para obtener su ID
    let saleId: number;
    try {
      const insertSaleRes = await this.ctx.db
        .prepare(
          `INSERT INTO sales (
            idempotency_key, request_hash, user_id, payment_method_id, customer_id,
            subtotal_cents, discount_cents, surcharge_cents, installments, card_type, card_brand, exchange_rate_usd,
            total_cents, status, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
        )
        .bind(
          idempotencyKey,
          requestHash,
          this.ctx.user.id,
          paymentMethodId,
          customerId ?? null,
          calculatedSubtotal,
          discountCents,
          surchargeCents,
          installments,
          cardType ?? null,
          cardBrand ?? null,
          exchangeRateUsd ?? null,
          calculatedTotal,
          finalNotes,
          now,
        )
        .run();

      saleId = insertSaleRes.meta.last_row_id;
    } catch (e: any) {
      if (isConstraintError(e, 'UNIQUE', 'sales.idempotency_key')) {
        // En caso de carrera por confirmación simultánea, retornar la venta existente
        const dup = await this.ctx.db
          .prepare('SELECT id FROM sales WHERE idempotency_key = ?')
          .bind(idempotencyKey)
          .first<{ id: number }>();
        if (dup) return (await this.getSaleById(dup.id))!;
      }
      throw e;
    }

    // Paso 2: Ejecutar atómicamente en un solo batch:
    //  - Todos los items de venta (snapshot de nombre, SKU, precio unitario, cantidad)
    //  - UPDATE stock de cada producto (con CHECK(stock >= 0) como red de seguridad concurrente)
    //  - stock_movements correspondientes a cada producto
    //  - Registro de auditoría
    const batch: D1PreparedStatement[] = [];

    for (const line of pricedLines) {
      // 1. Snapshot del item (con registro de carga manual y motivo si corresponde)
      batch.push(
        this.ctx.db
          .prepare(
            `INSERT INTO sale_items (
              sale_id, product_id, sku, name, unit_price_cents, unit_cost_cents, quantity, line_total_cents, returned_qty, is_manual, manual_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          )
          .bind(
            saleId,
            line.product.id,
            line.product.sku,
            line.product.name,
            line.unitPriceCents,
            line.unitCostCents,
            line.quantity,
            line.lineTotalCents,
            line.isManual ? 1 : 0,
            line.manualReason,
          ),
      );

      // 2. Descuento de stock en producto + actualización de fecha de última venta (last_sale_at)
      batch.push(
        this.ctx.db
          .prepare(
            `UPDATE products
             SET stock = stock - ?, last_movement_at = ?, last_sale_at = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(line.quantity, now, now, now, line.product.id),
      );

      // 3. Movimiento de inventario auditable
      const stockBefore = line.product.stock;
      const stockAfter = stockBefore - line.quantity;
      batch.push(
        this.ctx.db
          .prepare(
            `INSERT INTO stock_movements (
              product_id, type, quantity, stock_before, stock_after, user_id, reason, ref_type, ref_id, created_at
            ) VALUES (?, 'sale', ?, ?, ?, ?, ?, 'sale', ?, ?)`,
          )
          .bind(
            line.product.id,
            -line.quantity,
            stockBefore,
            stockAfter,
            this.ctx.user.id,
            `Venta ${formatSaleNumber(saleId)}`,
            saleId,
            now,
          ),
      );
    }

    batch.push(
      auditStmt(this.ctx, 'pos.sale_create', 'sales', saleId, {
        saleNumber: formatSaleNumber(saleId),
        totalCents: calculatedTotal,
        itemCount: pricedLines.length,
      }),
    );

    try {
      await this.ctx.db.batch(batch);
    } catch (e: any) {
      // Si el batch falla (por ejemplo por violación de CHECK de stock ante concurrencia),
      // debemos anular la cabecera de la venta para que no quede huérfana.
      await this.ctx.db.prepare('DELETE FROM sales WHERE id = ?').bind(saleId).run();

      if (isConstraintError(e, 'CHECK', 'stock >= 0')) {
        throw Errors.conflict(
          'INSUFFICIENT_STOCK',
          'El stock cambió mientras se confirmaba la venta. Por favor, revisá las cantidades en el mostrador.',
        );
      }
      throw e;
    }

    return (await this.getSaleById(saleId))!;
  }

  async getSaleById(id: number): Promise<SaleDetail | null> {
    const sale = await this.ctx.db
      .prepare(
        `SELECT s.id, s.idempotency_key, s.user_id, s.payment_method_id, s.customer_id,
                s.subtotal_cents, s.discount_cents, s.surcharge_cents, s.installments, s.card_type, s.card_brand, s.exchange_rate_usd,
                s.total_cents, s.refunded_cents,
                s.status, s.notes, s.created_at,
                u.display_name AS user_name,
                pm.name AS payment_method_name,
                c.name AS customer_name
         FROM sales s
         JOIN users u ON u.id = s.user_id
         JOIN payment_methods pm ON pm.id = s.payment_method_id
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.id = ?`,
      )
      .bind(id)
      .first<any>();

    if (!sale) return null;

    const items = await this.ctx.db
      .prepare(
        `SELECT id, product_id, sku, name, unit_price_cents, unit_cost_cents, quantity, line_total_cents, returned_qty, is_manual, manual_reason
         FROM sale_items
         WHERE sale_id = ?
         ORDER BY id ASC`,
      )
      .bind(id)
      .all<any>();

    return {
      id: sale.id,
      saleNumber: formatSaleNumber(sale.id),
      idempotencyKey: sale.idempotency_key,
      userId: sale.user_id,
      userName: sale.user_name,
      customerId: sale.customer_id ?? null,
      customerName: sale.customer_name ?? null,
      paymentMethodId: sale.payment_method_id,
      paymentMethodName: sale.payment_method_name,
      subtotalCents: sale.subtotal_cents,
      discountCents: sale.discount_cents,
      surchargeCents: sale.surcharge_cents ?? 0,
      installments: sale.installments ?? 1,
      cardType: sale.card_type ?? null,
      cardBrand: sale.card_brand ?? null,
      exchangeRateUsd: sale.exchange_rate_usd ?? null,
      totalCents: sale.total_cents,
      refundedCents: sale.refunded_cents,
      status: sale.status,
      notes: sale.notes,
      createdAt: sale.created_at,
      items: items.results.map((it) => ({
        id: it.id,
        productId: it.product_id,
        sku: it.sku,
        name: it.name,
        unitPriceCents: it.unit_price_cents,
        unitCostCents: it.unit_cost_cents ?? null,
        quantity: it.quantity,
        lineTotalCents: it.line_total_cents,
        returnedQty: it.returned_qty,
        isManual: it.is_manual === 1,
        manualReason: it.manual_reason ?? null,
      })),
    };
  }

  /**
   * Anula una venta completa (solo admin).
   * Repone el stock de todos los artículos no devueltos previamente.
   */
  async voidSale(saleId: number, idempotencyKey: string, reason: string): Promise<SaleDetail> {
    const sale = await this.getSaleById(saleId);
    if (!sale) throw Errors.notFound('La venta');

    if (sale.status === 'voided') {
      return sale; // Idempotente
    }
    if (sale.status === 'returned') {
      throw Errors.badRequest('La venta ya fue devuelta en su totalidad.');
    }

    const now = nowIso();
    const batch: D1PreparedStatement[] = [];

    // Registrar devolución tipo 'void'
    const refundCents = sale.totalCents - sale.refundedCents;
    batch.push(
      this.ctx.db
        .prepare(
          `INSERT INTO returns (idempotency_key, sale_id, user_id, kind, reason, refund_cents, created_at)
           VALUES (?, ?, ?, 'void', ?, ?, ?)`,
        )
        .bind(idempotencyKey, saleId, this.ctx.user.id, reason, refundCents, now),
    );

    // Reponer stock por cada item que no haya sido completamente devuelto
    for (const item of sale.items) {
      const remainingQty = item.quantity - item.returnedQty;
      if (remainingQty > 0) {
        // 1. Actualizar returned_qty en el sale_item
        batch.push(
          this.ctx.db
            .prepare('UPDATE sale_items SET returned_qty = quantity WHERE id = ?')
            .bind(item.id),
        );

        // 2. Reponer stock en producto
        batch.push(
          this.ctx.db
            .prepare(
              'UPDATE products SET stock = stock + ?, last_movement_at = ?, updated_at = ? WHERE id = ?',
            )
            .bind(remainingQty, now, now, item.productId),
        );

        // 3. Registrar movimiento de inventario
        // Obtenemos stock actual de producto
        const pRow = await this.ctx.db
          .prepare('SELECT stock FROM products WHERE id = ?')
          .bind(item.productId)
          .first<{ stock: number }>();
        const currentStock = pRow?.stock ?? 0;

        batch.push(
          this.ctx.db
            .prepare(
              `INSERT INTO stock_movements (
                product_id, type, quantity, stock_before, stock_after, user_id, reason, ref_type, ref_id, created_at
              ) VALUES (?, 'reversal', ?, ?, ?, ?, ?, 'return', ?, ?)`,
            )
            .bind(
              item.productId,
              remainingQty,
              currentStock,
              currentStock + remainingQty,
              this.ctx.user.id,
              `Anulación de venta ${sale.saleNumber}: ${reason}`,
              saleId,
              now,
            ),
        );
      }
    }

    // Actualizar estado de la venta
    batch.push(
      this.ctx.db
        .prepare('UPDATE sales SET status = ?, refunded_cents = total_cents WHERE id = ?')
        .bind('voided', saleId),
    );

    batch.push(
      auditStmt(this.ctx, 'pos.sale_void', 'sales', saleId, {
        saleNumber: sale.saleNumber,
        reason,
        refundCents,
      }),
    );

    await this.ctx.db.batch(batch);
    return (await this.getSaleById(saleId))!;
  }

  /**
   * Registra una devolución parcial o total de artículos seleccionados.
   */
  async returnItems(
    saleId: number,
    idempotencyKey: string,
    reason: string,
    itemsToReturn: { saleItemId: number; quantity: number; restock: boolean }[],
  ): Promise<SaleDetail> {
    const sale = await this.getSaleById(saleId);
    if (!sale) throw Errors.notFound('La venta');
    if (sale.status === 'voided') throw Errors.badRequest('No se puede devolver una venta anulada.');

    const itemMap = new Map(sale.items.map((it) => [it.id, it]));

    let returnedLinesValueCents = 0;
    for (const ret of itemsToReturn) {
      const saleItem = itemMap.get(ret.saleItemId);
      if (!saleItem) throw Errors.badRequest(`El artículo ID ${ret.saleItemId} no pertenece a esta venta.`);
      const remainingQty = saleItem.quantity - saleItem.returnedQty;
      if (ret.quantity > remainingQty) {
        throw Errors.badRequest(
          `No se pueden devolver ${ret.quantity} unidades de "${saleItem.name}". Pendientes de devolución: ${remainingQty}.`,
        );
      }
      returnedLinesValueCents += saleItem.unitPriceCents * ret.quantity;
    }

    const refundCents = refundAmount({
      returnedLinesValueCents,
      saleSubtotalCents: sale.subtotalCents,
      saleTotalCents: sale.totalCents,
      alreadyRefundedCents: sale.refundedCents,
    });

    const now = nowIso();
    const batch: D1PreparedStatement[] = [];

    // Insertar devolución
    let returnId: number;
    try {
      const retRes = await this.ctx.db
        .prepare(
          `INSERT INTO returns (idempotency_key, sale_id, user_id, kind, reason, refund_cents, created_at)
           VALUES (?, ?, ?, 'return', ?, ?, ?)`,
        )
        .bind(idempotencyKey, saleId, this.ctx.user.id, reason, refundCents, now)
        .run();
      returnId = retRes.meta.last_row_id;
    } catch (e: any) {
      if (isConstraintError(e, 'UNIQUE', 'returns.idempotency_key')) {
        return (await this.getSaleById(saleId))!;
      }
      throw e;
    }

    for (const ret of itemsToReturn) {
      const saleItem = itemMap.get(ret.saleItemId)!;

      batch.push(
        this.ctx.db
          .prepare(
            `INSERT INTO return_items (return_id, sale_item_id, product_id, quantity, restock)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(returnId, ret.saleItemId, saleItem.productId, ret.quantity, ret.restock ? 1 : 0),
      );

      batch.push(
        this.ctx.db
          .prepare('UPDATE sale_items SET returned_qty = returned_qty + ? WHERE id = ?')
          .bind(ret.quantity, ret.saleItemId),
      );

      if (ret.restock) {
        batch.push(
          this.ctx.db
            .prepare('UPDATE products SET stock = stock + ?, last_movement_at = ?, updated_at = ? WHERE id = ?')
            .bind(ret.quantity, now, now, saleItem.productId),
        );

        const pRow = await this.ctx.db
          .prepare('SELECT stock FROM products WHERE id = ?')
          .bind(saleItem.productId)
          .first<{ stock: number }>();
        const currentStock = pRow?.stock ?? 0;

        batch.push(
          this.ctx.db
            .prepare(
              `INSERT INTO stock_movements (
                product_id, type, quantity, stock_before, stock_after, user_id, reason, ref_type, ref_id, created_at
              ) VALUES (?, 'return', ?, ?, ?, ?, ?, 'return', ?, ?)`,
            )
            .bind(
              saleItem.productId,
              ret.quantity,
              currentStock,
              currentStock + ret.quantity,
              this.ctx.user.id,
              `Devolución de venta ${sale.saleNumber}: ${reason}`,
              saleId,
              now,
            ),
        );
      }
    }

    const newRefundedTotal = sale.refundedCents + refundCents;
    const allReturned = sale.items.every((it) => {
      const inThis = itemsToReturn.find((r) => r.saleItemId === it.id)?.quantity ?? 0;
      return it.returnedQty + inThis >= it.quantity;
    });

    const newStatus = allReturned ? 'returned' : 'partially_returned';

    batch.push(
      this.ctx.db
        .prepare('UPDATE sales SET status = ?, refunded_cents = ? WHERE id = ?')
        .bind(newStatus, newRefundedTotal, saleId),
    );

    batch.push(
      auditStmt(this.ctx, 'pos.sale_return', 'sales', saleId, {
        saleNumber: sale.saleNumber,
        refundCents,
        reason,
        allReturned,
      }),
    );

    await this.ctx.db.batch(batch);
    return (await this.getSaleById(saleId))!;
  }

  async listSales(filter: { from?: string; to?: string; page?: number; pageSize?: number } = {}): Promise<{
    items: SaleDetail[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.from) {
      conditions.push('s.created_at >= ?');
      params.push(`${filter.from}T00:00:00.000Z`);
    }
    if (filter.to) {
      conditions.push('s.created_at <= ?');
      params.push(`${filter.to}T23:59:59.999Z`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await this.ctx.db
      .prepare(`SELECT COUNT(*) AS total FROM sales s ${where}`)
      .bind(...params)
      .first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const { results } = await this.ctx.db
      .prepare(
        `SELECT s.id, s.idempotency_key, s.user_id, s.payment_method_id,
                s.subtotal_cents, s.discount_cents, s.surcharge_cents, s.total_cents, s.refunded_cents,
                s.installments, s.card_type, s.card_brand, s.exchange_rate_usd,
                s.status, s.notes, s.created_at,
                u.display_name AS user_name,
                pm.name AS payment_method_name
         FROM sales s
         JOIN users u ON u.id = s.user_id
         JOIN payment_methods pm ON pm.id = s.payment_method_id
         ${where}
         ORDER BY s.id DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, offset)
      .all<any>();

    // Cargar detalles de cada venta
    const sales: SaleDetail[] = [];
    for (const r of results) {
      const items = await this.ctx.db
        .prepare('SELECT id, product_id, sku, name, unit_price_cents, quantity, line_total_cents, returned_qty, is_manual, manual_reason FROM sale_items WHERE sale_id = ?')
        .bind(r.id)
        .all<any>();

      sales.push({
        id: r.id,
        saleNumber: formatSaleNumber(r.id),
        idempotencyKey: r.idempotency_key,
        userId: r.user_id,
        userName: r.user_name,
        paymentMethodId: r.payment_method_id,
        paymentMethodName: r.payment_method_name,
        subtotalCents: r.subtotal_cents,
        discountCents: r.discount_cents,
        surchargeCents: r.surcharge_cents ?? 0,
        totalCents: r.total_cents,
        refundedCents: r.refunded_cents,
        installments: r.installments ?? 1,
        cardType: r.card_type ?? null,
        cardBrand: r.card_brand ?? null,
        exchangeRateUsd: r.exchange_rate_usd ?? null,
        status: r.status,
        notes: r.notes,
        createdAt: r.created_at,
        items: items.results.map((it) => ({
          id: it.id,
          productId: it.product_id,
          sku: it.sku,
          name: it.name,
          unitPriceCents: it.unit_price_cents,
          quantity: it.quantity,
          lineTotalCents: it.line_total_cents,
          returnedQty: it.returned_qty,
          isManual: it.is_manual === 1,
          manualReason: it.manual_reason ?? null,
        })),
      });
    }

    return {
      items: sales,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }
}
