import type { ServiceContext } from '../env';
import { Errors, isConstraintError } from '../lib/errors';
import { auditStmt, nowIso } from '../lib/db';

export interface MovementListItem {
  id: number;
  productId: number;
  productSku: string;
  productName: string;
  type: string;
  typeLabel: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  userId: number;
  userDisplayName: string;
  reason: string | null;
  refType: string | null;
  refId: number | null;
  opKey: string | null;
  createdAt: string;
}

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  initial: 'Stock inicial',
  purchase: 'Entrada de mercadería',
  sale: 'Venta',
  return: 'Devolución',
  adjust_in: 'Ajuste positivo',
  adjust_out: 'Ajuste negativo',
  reversal: 'Anulación de venta',
};

export class StockService {
  constructor(private ctx: ServiceContext) {}

  /**
   * Registra una entrada de mercadería (compra o carga inicial controlada).
   */
  async registerEntry(params: {
    idempotencyKey: string;
    productId: number;
    quantity: number;
    kind: 'purchase' | 'initial';
    reason?: string | null;
  }): Promise<{ movement: MovementListItem; currentStock: number }> {
    const { idempotencyKey, productId, quantity, kind, reason } = params;
    if (quantity <= 0) throw Errors.badRequest('La cantidad debe ser mayor a 0');

    // 1. Verificar idempotencia
    const existing = await this.ctx.db
      .prepare('SELECT id FROM stock_movements WHERE op_key = ?')
      .bind(idempotencyKey)
      .first<{ id: number }>();

    if (existing) {
      const mov = await this.getMovementById(existing.id);
      const product = await this.ctx.db
        .prepare('SELECT stock FROM products WHERE id = ?')
        .bind(productId)
        .first<{ stock: number }>();
      return { movement: mov!, currentStock: product?.stock ?? 0 };
    }

    // 2. Obtener producto actual
    const product = await this.ctx.db
      .prepare('SELECT id, sku, name, stock, active FROM products WHERE id = ?')
      .bind(productId)
      .first<{ id: number; sku: string; name: string; stock: number; active: number }>();

    if (!product) throw Errors.notFound('El producto');
    if (product.active !== 1) throw Errors.badRequest('No se puede modificar el stock de un producto inactivo.');

    const now = nowIso();
    const stockBefore = product.stock;
    const stockAfter = stockBefore + quantity;

    // 3. Ejecutar batch atómico
    const batch = [
      this.ctx.db
        .prepare('UPDATE products SET stock = stock + ?, last_movement_at = ?, updated_at = ? WHERE id = ?')
        .bind(quantity, now, now, productId),
      this.ctx.db
        .prepare(
          `INSERT INTO stock_movements (
            product_id, type, quantity, stock_before, stock_after, user_id, reason, ref_type, op_key, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
        )
        .bind(
          productId,
          kind,
          quantity,
          stockBefore,
          stockAfter,
          this.ctx.user.id,
          reason || (kind === 'purchase' ? 'Entrada de mercadería' : 'Stock inicial'),
          idempotencyKey,
          now,
        ),
      auditStmt(this.ctx, `stock.entry_${kind}`, 'products', productId, {
        quantity,
        stockBefore,
        stockAfter,
        reason,
        idempotencyKey,
      }),
    ];

    try {
      const results = await this.ctx.db.batch(batch);
      const movementId = results[1].meta.last_row_id;
      const movement = (await this.getMovementById(movementId))!;
      return { movement, currentStock: stockAfter };
    } catch (e: any) {
      if (isConstraintError(e, 'UNIQUE', 'stock_movements.op_key')) {
        // En caso de carrera simultánea, devolver el existente
        const dup = await this.ctx.db
          .prepare('SELECT id FROM stock_movements WHERE op_key = ?')
          .bind(idempotencyKey)
          .first<{ id: number }>();
        if (dup) {
          const mov = await this.getMovementById(dup.id);
          return { movement: mov!, currentStock: stockAfter };
        }
      }
      throw e;
    }
  }

  /**
   * Registra un ajuste de stock manual (positivo o negativo) con motivo obligatorio.
   */
  async registerAdjustment(params: {
    idempotencyKey: string;
    productId: number;
    direction: 'in' | 'out';
    quantity: number;
    reason: string;
  }): Promise<{ movement: MovementListItem; currentStock: number }> {
    const { idempotencyKey, productId, direction, quantity, reason } = params;
    if (quantity <= 0) throw Errors.badRequest('La cantidad debe ser mayor a 0');
    if (!reason || reason.trim().length < 3) throw Errors.badRequest('El motivo del ajuste es obligatorio.');

    // 1. Idempotencia
    const existing = await this.ctx.db
      .prepare('SELECT id FROM stock_movements WHERE op_key = ?')
      .bind(idempotencyKey)
      .first<{ id: number }>();

    if (existing) {
      const mov = await this.getMovementById(existing.id);
      const product = await this.ctx.db
        .prepare('SELECT stock FROM products WHERE id = ?')
        .bind(productId)
        .first<{ stock: number }>();
      return { movement: mov!, currentStock: product?.stock ?? 0 };
    }

    // 2. Producto actual
    const product = await this.ctx.db
      .prepare('SELECT id, sku, name, stock, active FROM products WHERE id = ?')
      .bind(productId)
      .first<{ id: number; sku: string; name: string; stock: number; active: number }>();

    if (!product) throw Errors.notFound('El producto');
    if (product.active !== 1) throw Errors.badRequest('No se puede ajustar el stock de un producto inactivo.');

    const signedQty = direction === 'in' ? quantity : -quantity;
    const stockBefore = product.stock;
    const stockAfter = stockBefore + signedQty;

    if (stockAfter < 0) {
      throw Errors.conflict(
        'INSUFFICIENT_STOCK',
        `No es posible ajustar: el stock actual (${stockBefore}) es menor a la cantidad a descontar (${quantity}).`,
        { currentStock: stockBefore, requested: quantity },
      );
    }

    const type = direction === 'in' ? 'adjust_in' : 'adjust_out';
    const now = nowIso();

    const batch = [
      this.ctx.db
        .prepare('UPDATE products SET stock = stock + ?, last_movement_at = ?, updated_at = ? WHERE id = ?')
        .bind(signedQty, now, now, productId),
      this.ctx.db
        .prepare(
          `INSERT INTO stock_movements (
            product_id, type, quantity, stock_before, stock_after, user_id, reason, ref_type, op_key, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
        )
        .bind(
          productId,
          type,
          signedQty,
          stockBefore,
          stockAfter,
          this.ctx.user.id,
          reason.trim(),
          idempotencyKey,
          now,
        ),
      auditStmt(this.ctx, `stock.adjustment_${direction}`, 'products', productId, {
        direction,
        quantity,
        stockBefore,
        stockAfter,
        reason,
        idempotencyKey,
      }),
    ];

    try {
      const results = await this.ctx.db.batch(batch);
      const movementId = results[1].meta.last_row_id;
      const movement = (await this.getMovementById(movementId))!;
      return { movement, currentStock: stockAfter };
    } catch (e: any) {
      if (isConstraintError(e, 'CHECK', 'stock >= 0')) {
        throw Errors.conflict('INSUFFICIENT_STOCK', 'Operación rechazada: el stock resultante no puede ser negativo.');
      }
      if (isConstraintError(e, 'UNIQUE', 'stock_movements.op_key')) {
        const dup = await this.ctx.db
          .prepare('SELECT id FROM stock_movements WHERE op_key = ?')
          .bind(idempotencyKey)
          .first<{ id: number }>();
        if (dup) {
          const mov = await this.getMovementById(dup.id);
          return { movement: mov!, currentStock: stockAfter };
        }
      }
      throw e;
    }
  }

  async getMovementById(id: number): Promise<MovementListItem | null> {
    const r = await this.ctx.db
      .prepare(
        `SELECT sm.id, sm.product_id, sm.type, sm.quantity, sm.stock_before, sm.stock_after,
                sm.user_id, sm.reason, sm.ref_type, sm.ref_id, sm.op_key, sm.created_at,
                p.sku AS product_sku, p.name AS product_name,
                u.display_name AS user_display_name
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         JOIN users u ON u.id = sm.user_id
         WHERE sm.id = ?`,
      )
      .bind(id)
      .first<any>();

    if (!r) return null;

    return {
      id: r.id,
      productId: r.product_id,
      productSku: r.product_sku,
      productName: r.product_name,
      type: r.type,
      typeLabel: MOVEMENT_TYPE_LABELS[r.type] || r.type,
      quantity: r.quantity,
      stockBefore: r.stock_before,
      stockAfter: r.stock_after,
      userId: r.user_id,
      userDisplayName: r.user_display_name,
      reason: r.reason,
      refType: r.ref_type,
      refId: r.ref_id,
      opKey: r.op_key,
      createdAt: r.created_at,
    };
  }

  async list(filter: {
    productId?: number;
    type?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{
    items: MovementListItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 50));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.productId) {
      conditions.push('sm.product_id = ?');
      params.push(filter.productId);
    }
    if (filter.type) {
      conditions.push('sm.type = ?');
      params.push(filter.type);
    }
    if (filter.from) {
      conditions.push('sm.created_at >= ?');
      params.push(`${filter.from}T00:00:00.000Z`);
    }
    if (filter.to) {
      conditions.push('sm.created_at <= ?');
      params.push(`${filter.to}T23:59:59.999Z`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await this.ctx.db
      .prepare(`SELECT COUNT(*) AS total FROM stock_movements sm ${where}`)
      .bind(...params)
      .first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const { results } = await this.ctx.db
      .prepare(
        `SELECT sm.id, sm.product_id, sm.type, sm.quantity, sm.stock_before, sm.stock_after,
                sm.user_id, sm.reason, sm.ref_type, sm.ref_id, sm.op_key, sm.created_at,
                p.sku AS product_sku, p.name AS product_name,
                u.display_name AS user_display_name
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         JOIN users u ON u.id = sm.user_id
         ${where}
         ORDER BY sm.id DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, offset)
      .all<any>();

    const items: MovementListItem[] = results.map((r) => ({
      id: r.id,
      productId: r.product_id,
      productSku: r.product_sku,
      productName: r.product_name,
      type: r.type,
      typeLabel: MOVEMENT_TYPE_LABELS[r.type] || r.type,
      quantity: r.quantity,
      stockBefore: r.stock_before,
      stockAfter: r.stock_after,
      userId: r.user_id,
      userDisplayName: r.user_display_name,
      reason: r.reason,
      refType: r.ref_type,
      refId: r.ref_id,
      opKey: r.op_key,
      createdAt: r.created_at,
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }
}
