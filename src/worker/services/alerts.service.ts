import type { ServiceContext } from '../env';
import { stockStatus, suggestReplenishment, replenishmentPriority, type StockStatus } from '../../shared/stock';

export interface StockAlertItem {
  productId: number;
  sku: string;
  name: string;
  brand: string | null;
  categoryId: number | null;
  categoryName: string | null;
  stock: number;
  minStock: number | null;
  targetStock: number | null;
  differenceToMin: number | null;
  status: StockStatus;
  statusLabel: string;
  priority: 1 | 2 | 3;
  priorityLabel: string;
  suggestedReplenishment: {
    quantity: number;
    basis: 'target' | 'min_fallback' | 'none';
    explanation: string;
  };
  lastMovementAt: string | null;
}

export class AlertsService {
  constructor(private ctx: ServiceContext) {}

  async getSummary(): Promise<{
    outOfStock: number;
    lowStock: number;
    undefinedMin: number;
    totalRequiringAttention: number;
  }> {
    const row = await this.ctx.db
      .prepare(
        `SELECT
          SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) AS out_count,
          SUM(CASE WHEN stock > 0 AND min_stock IS NOT NULL AND stock <= min_stock THEN 1 ELSE 0 END) AS low_count,
          SUM(CASE WHEN stock > 0 AND min_stock IS NULL THEN 1 ELSE 0 END) AS no_min_count
         FROM products
         WHERE active = 1`,
      )
      .first<{ out_count: number | null; low_count: number | null; no_min_count: number | null }>();

    const outOfStock = row?.out_count ?? 0;
    const lowStock = row?.low_count ?? 0;
    const undefinedMin = row?.no_min_count ?? 0;

    return {
      outOfStock,
      lowStock,
      undefinedMin,
      totalRequiringAttention: outOfStock + lowStock,
    };
  }

  async listAlerts(filter: {
    categoryId?: number;
    brand?: string;
    status?: 'all' | 'out' | 'low' | 'no_min';
    page?: number;
    pageSize?: number;
  } = {}): Promise<{
    items: StockAlertItem[];
    summary: { outOfStock: number; lowStock: number; undefinedMin: number; totalRequiringAttention: number };
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const summary = await this.getSummary();

    // Obtener factor de reposición de settings
    const factorRow = await this.ctx.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .bind('replenishment_fallback_factor')
      .first<{ value: string }>();
    const fallbackFactor = factorRow ? Number(JSON.parse(factorRow.value)) : 2;

    const conditions: string[] = ['p.active = 1'];
    const params: unknown[] = [];

    if (filter.status === 'out') {
      conditions.push('p.stock = 0');
    } else if (filter.status === 'low') {
      conditions.push('p.stock > 0 AND p.min_stock IS NOT NULL AND p.stock <= p.min_stock');
    } else if (filter.status === 'no_min') {
      conditions.push('p.stock > 0 AND p.min_stock IS NULL');
    } else {
      // Por defecto: mostrar productos agotados o con stock bajo
      conditions.push('(p.stock = 0 OR (p.min_stock IS NOT NULL AND p.stock <= p.min_stock))');
    }

    if (filter.categoryId) {
      conditions.push('p.category_id = ?');
      params.push(filter.categoryId);
    }
    if (filter.brand) {
      conditions.push('p.brand = ? COLLATE NOCASE');
      params.push(filter.brand);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countRow = await this.ctx.db
      .prepare(`SELECT COUNT(*) AS total FROM products p ${where}`)
      .bind(...params)
      .first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filter.pageSize ?? 50));
    const offset = (page - 1) * pageSize;

    const { results } = await this.ctx.db
      .prepare(
        `SELECT p.id, p.sku, p.name, p.brand, p.category_id,
                c.name AS category_name, p.stock, p.min_stock, p.target_stock,
                p.last_movement_at
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         ${where}
         ORDER BY (CASE WHEN p.stock = 0 THEN 1 ELSE 2 END) ASC, p.stock ASC, p.name COLLATE NOCASE ASC
         LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, offset)
      .all<any>();

    const items: StockAlertItem[] = results.map((r) => {
      const status = stockStatus(r.stock, r.min_stock);
      const priority = replenishmentPriority(status) ?? 3;
      const suggested = suggestReplenishment(r.stock, r.min_stock, r.target_stock, fallbackFactor);
      const diff = r.min_stock !== null ? r.stock - r.min_stock : null;

      const priorityLabel = priority === 1 ? 'Urgente (Agotado)' : priority === 2 ? 'Alta (Bajo)' : 'Definir mínimo';

      return {
        productId: r.id,
        sku: r.sku,
        name: r.name,
        brand: r.brand,
        categoryId: r.category_id,
        categoryName: r.category_name,
        stock: r.stock,
        minStock: r.min_stock,
        targetStock: r.target_stock,
        differenceToMin: diff,
        status,
        statusLabel: status === 'out' ? 'Agotado' : status === 'low' ? 'Stock bajo' : 'Mínimo sin definir',
        priority,
        priorityLabel,
        suggestedReplenishment: suggested,
        lastMovementAt: r.last_movement_at,
      };
    });

    return {
      items,
      summary,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }
}
