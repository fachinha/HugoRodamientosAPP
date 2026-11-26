import type { ServiceContext } from '../env';
import { argentinaDayRangeUtc } from '../../shared/time';
import { MOVEMENT_TYPE_LABELS } from './stock.service';
import { getOrComputeCached } from '../lib/cache';

export interface DashboardData {
  productsCount: number;
  outOfStockCount: number;
  lowStockCount: number;
  urgentReplenishmentCount: number;
  todaySalesCount: number;
  todaySalesTotalCents: number;
  todayDayLabel: string;
  missingDataSummary: {
    productsMissingPrice: number;
    productsMissingCost: number;
    productsPendingStockCount: number;
    customersMissingPhone: number;
    suppliersMissingContact: number;
  };
  recentMovements: {
    id: number;
    productId: number;
    productSku: string;
    productName: string;
    type: string;
    typeLabel: string;
    quantity: number;
    stockAfter: number;
    userDisplayName: string;
    createdAt: string;
  }[];
}

export class DashboardService {
  constructor(private ctx: ServiceContext) {}

  async getDashboardData(): Promise<DashboardData> {
    const [productsRow, custMissingRow, supMissingRow] = await getOrComputeCached(
      'dashboard:catalog_aggregates',
      90_000,
      () =>
        Promise.all([
          this.ctx.db
            .prepare(
              `SELECT
                COUNT(*) AS total_products,
                SUM(CASE WHEN stock = 0 AND (min_stock IS NOT NULL OR last_movement_at IS NOT NULL) THEN 1 ELSE 0 END) AS out_count,
                SUM(CASE WHEN stock > 0 AND min_stock IS NOT NULL AND stock <= min_stock THEN 1 ELSE 0 END) AS low_count,
                SUM(CASE WHEN price_cents = 0 AND (stock > 0 OR last_movement_at IS NOT NULL OR last_purchase_at IS NOT NULL OR last_sale_at IS NOT NULL OR COALESCE(supplier_name, '') <> 'BRAMCO') THEN 1 ELSE 0 END) AS no_price_count,
                SUM(CASE WHEN (cost_cents IS NULL OR cost_cents = 0) AND (stock > 0 OR last_movement_at IS NOT NULL OR last_purchase_at IS NOT NULL OR last_sale_at IS NOT NULL OR COALESCE(supplier_name, '') <> 'BRAMCO') THEN 1 ELSE 0 END) AS no_cost_count,
                SUM(CASE WHEN stock = 0 AND min_stock IS NULL AND last_movement_at IS NULL AND (last_purchase_at IS NOT NULL OR last_sale_at IS NOT NULL OR id <= 7050) THEN 1 ELSE 0 END) AS uncounted_stock_count
               FROM products
               WHERE active = 1`,
            )
            .first<{
              total_products: number;
              out_count: number | null;
              low_count: number | null;
              no_price_count: number | null;
              no_cost_count: number | null;
              uncounted_stock_count: number | null;
            }>(),
          this.ctx.db
            .prepare(`SELECT COUNT(*) AS cnt FROM customers WHERE phone IS NULL OR trim(phone) = ''`)
            .first<{ cnt: number | null }>(),
          this.ctx.db
            .prepare(
              `SELECT COUNT(*) AS cnt FROM suppliers WHERE active = 1 AND (phone IS NULL OR trim(phone) = '' OR cuit IS NULL OR trim(cuit) = '')`,
            )
            .first<{ cnt: number | null }>(),
        ]),
    );

    const productsCount = productsRow?.total_products ?? 0;
    const outOfStockCount = productsRow?.out_count ?? 0;
    const lowStockCount = productsRow?.low_count ?? 0;
    const urgentReplenishmentCount = outOfStockCount + lowStockCount;

    const todayRange = argentinaDayRangeUtc(new Date());

    const salesRow = await this.ctx.db
      .prepare(
        `SELECT
          COUNT(*) AS sales_count,
          SUM(total_cents - refunded_cents) AS total_revenue
         FROM sales
         WHERE created_at >= ? AND created_at < ? AND status <> 'voided'`,
      )
      .bind(todayRange.start, todayRange.end)
      .first<{ sales_count: number; total_revenue: number | null }>();

    const todaySalesCount = salesRow?.sales_count ?? 0;
    const todaySalesTotalCents = Math.max(0, salesRow?.total_revenue ?? 0);

    const recent = await this.ctx.db
      .prepare(
        `SELECT sm.id, sm.product_id, sm.type, sm.quantity, sm.stock_after, sm.created_at,
                p.sku AS product_sku, p.name AS product_name,
                u.display_name AS user_display_name
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         JOIN users u ON u.id = sm.user_id
         ORDER BY sm.id DESC
         LIMIT 10`,
      )
      .all<any>();

    const recentMovements = recent.results.map((r) => ({
      id: r.id,
      productId: r.product_id,
      productSku: r.product_sku,
      productName: r.product_name,
      type: r.type,
      typeLabel: MOVEMENT_TYPE_LABELS[r.type] || r.type,
      quantity: r.quantity,
      stockAfter: r.stock_after,
      userDisplayName: r.user_display_name,
      createdAt: r.created_at,
    }));

    return {
      productsCount,
      outOfStockCount,
      lowStockCount,
      urgentReplenishmentCount,
      todaySalesCount,
      todaySalesTotalCents,
      todayDayLabel: todayRange.label,
      missingDataSummary: {
        productsMissingPrice: productsRow?.no_price_count ?? 0,
        productsMissingCost: productsRow?.no_cost_count ?? 0,
        productsPendingStockCount: productsRow?.uncounted_stock_count ?? 0,
        customersMissingPhone: custMissingRow?.cnt ?? 0,
        suppliersMissingContact: supMissingRow?.cnt ?? 0,
      },
      recentMovements,
    };
  }
}
