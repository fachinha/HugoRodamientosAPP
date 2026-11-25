import type { ServiceContext } from '../env';
import { Errors } from '../lib/errors';
import type {
  AnalyticsPeriodQuery,
  StoreAnalyticsSummary,
  DailySalesPoint,
  ProductProfitabilityItem,
  BrandProfitabilityItem,
  PaymentMethodPerformanceItem,
  SellerPerformanceItem,
  AbcClassification,
} from '../../shared/crm';

export class AnalyticsService {
  constructor(private ctx: ServiceContext) {}

  /**
   * Resuelve el rango de fechas en UTC para el período solicitado.
   */
  private resolvePeriodDates(query: AnalyticsPeriodQuery): { from: string; to: string; label: string } {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    if (query.period === 'custom' && query.from && query.to) {
      return {
        from: `${query.from}T00:00:00.000Z`,
        to: `${query.to}T23:59:59.999Z`,
        label: `${query.from} al ${query.to}`,
      };
    }

    if (query.period === 'last_month') {
      const prevMonthYear = month === 0 ? year - 1 : year;
      const prevMonth = month === 0 ? 11 : month - 1;
      const start = new Date(Date.UTC(prevMonthYear, prevMonth, 1));
      const end = new Date(Date.UTC(prevMonthYear, prevMonth + 1, 0, 23, 59, 59, 999));
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      return {
        from: start.toISOString(),
        to: end.toISOString(),
        label: `Mes anterior (${monthNames[prevMonth]} ${prevMonthYear})`,
      };
    }

    if (query.period === 'last_30_days') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return {
        from: start.toISOString(),
        to: now.toISOString(),
        label: 'Últimos 30 días',
      };
    }

    if (query.period === 'last_90_days') {
      const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return {
        from: start.toISOString(),
        to: now.toISOString(),
        label: 'Últimos 90 días',
      };
    }

    if (query.period === 'year_to_date') {
      const start = new Date(Date.UTC(year, 0, 1));
      return {
        from: start.toISOString(),
        to: now.toISOString(),
        label: `Año ${year} acumulado`,
      };
    }

    // Default: 'this_month'
    const start = new Date(Date.UTC(year, month, 1));
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return {
      from: start.toISOString(),
      to: now.toISOString(),
      label: `Este mes (${monthNames[month]} ${year})`,
    };
  }

  /**
   * Resumen general de rendimiento y rentabilidad del local (Ventas del Mes / Período).
   */
  async getStorePerformance(query: AnalyticsPeriodQuery): Promise<StoreAnalyticsSummary> {
    const { from, to, label } = this.resolvePeriodDates(query);

    // 1. Facturación, ventas y devoluciones
    const salesAggRow = await this.ctx.db
      .prepare(
        `SELECT
           COUNT(DISTINCT s.id) AS sales_count,
           COALESCE(SUM(s.total_cents), 0) AS total_revenue_cents,
           COALESCE(SUM(s.refunded_cents), 0) AS refunded_cents
         FROM sales s
         WHERE s.created_at >= ? AND s.created_at <= ? AND s.status <> 'voided'`,
      )
      .bind(from, to)
      .first<{ sales_count: number; total_revenue_cents: number; refunded_cents: number }>();

    const revenueCents = (salesAggRow?.total_revenue_cents || 0) - (salesAggRow?.refunded_cents || 0);
    const salesCount = salesAggRow?.sales_count || 0;
    const refundedCents = salesAggRow?.refunded_cents || 0;

    // 2. Costo de Mercadería Vendida (CMV) y unidades vendidas
    // Toma el costo snapshot si existe (unit_cost_cents) o el del catálogo vigente (products.cost_cents)
    const costAggRow = await this.ctx.db
      .prepare(
        `SELECT
           COALESCE(SUM((si.quantity - si.returned_qty) * COALESCE(si.unit_cost_cents, p.cost_cents, 0)), 0) AS total_cost_cents,
           COALESCE(SUM(si.quantity - si.returned_qty), 0) AS units_sold
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         WHERE s.created_at >= ? AND s.created_at <= ? AND s.status <> 'voided'`,
      )
      .bind(from, to)
      .first<{ total_cost_cents: number; units_sold: number }>();

    const costCents = costAggRow?.total_cost_cents || 0;
    const unitsSold = costAggRow?.units_sold || 0;
    const grossProfitCents = revenueCents - costCents;
    const grossMarginPct = revenueCents > 0 ? Math.round(((revenueCents - costCents) / revenueCents) * 1000) / 10 : 0;
    const averageTicketCents = salesCount > 0 ? Math.round(revenueCents / salesCount) : 0;

    // 3. Tendencia diaria (gráfico diario)
    const dailyRows = await this.ctx.db
      .prepare(
        `SELECT
           date(s.created_at) AS sale_date,
           COUNT(DISTINCT s.id) AS count,
           COALESCE(SUM(s.total_cents - s.refunded_cents), 0) AS daily_revenue,
           COALESCE(SUM((si.quantity - si.returned_qty) * COALESCE(si.unit_cost_cents, p.cost_cents, 0)), 0) AS daily_cost
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         JOIN products p ON p.id = si.product_id
         WHERE s.created_at >= ? AND s.created_at <= ? AND s.status <> 'voided'
         GROUP BY date(s.created_at)
         ORDER BY sale_date ASC`,
      )
      .bind(from, to)
      .all<any>();

    const dailyTrend: DailySalesPoint[] = (dailyRows.results || []).map((r) => {
      const dRev = r.daily_revenue || 0;
      const dCost = r.daily_cost || 0;
      const dProfit = dRev - dCost;
      const dMargin = dRev > 0 ? Math.round((dProfit / dRev) * 1000) / 10 : 0;

      // Label legible: "DD/MM"
      const parts = String(r.sale_date).split('-');
      const dayLabel = parts.length === 3 ? `${parts[2]}/${parts[1]}` : r.sale_date;

      return {
        date: r.sale_date,
        dayLabel,
        revenueCents: dRev,
        costCents: dCost,
        profitCents: dProfit,
        marginPct: dMargin,
        salesCount: r.count,
      };
    });

    // 4. Desglose por Medio de Pago
    const pmRows = await this.ctx.db
      .prepare(
        `SELECT
           pm.id AS payment_method_id,
           pm.name,
           COUNT(s.id) AS sales_count,
           COALESCE(SUM(s.total_cents - s.refunded_cents), 0) AS total_cents
         FROM sales s
         JOIN payment_methods pm ON pm.id = s.payment_method_id
         WHERE s.created_at >= ? AND s.created_at <= ? AND s.status <> 'voided'
         GROUP BY pm.id, pm.name
         ORDER BY total_cents DESC`,
      )
      .bind(from, to)
      .all<any>();

    const byPaymentMethod: PaymentMethodPerformanceItem[] = (pmRows.results || []).map((r) => ({
      paymentMethodId: r.payment_method_id,
      name: r.name,
      salesCount: r.sales_count,
      totalCents: r.total_cents,
      pctOfTotal: revenueCents > 0 ? Math.round((r.total_cents / revenueCents) * 1000) / 10 : 0,
    }));

    // 5. Rendimiento por Vendedor / Asesor
    const sellerRows = await this.ctx.db
      .prepare(
        `SELECT
           u.id AS user_id,
           u.display_name,
           COUNT(DISTINCT s.id) AS sales_count,
           COALESCE(SUM(s.total_cents - s.refunded_cents), 0) AS revenue_cents,
           COALESCE(SUM((si.quantity - si.returned_qty) * COALESCE(si.unit_cost_cents, p.cost_cents, 0)), 0) AS cost_cents
         FROM sales s
         JOIN users u ON u.id = s.user_id
         JOIN sale_items si ON si.sale_id = s.id
         JOIN products p ON p.id = si.product_id
         WHERE s.created_at >= ? AND s.created_at <= ? AND s.status <> 'voided'
         GROUP BY u.id, u.display_name
         ORDER BY revenue_cents DESC`,
      )
      .bind(from, to)
      .all<any>();

    const bySeller: SellerPerformanceItem[] = (sellerRows.results || []).map((r) => {
      const sRev = r.revenue_cents || 0;
      const sCost = r.cost_cents || 0;
      const sCount = r.sales_count || 0;
      return {
        userId: r.user_id,
        displayName: r.display_name,
        salesCount: sCount,
        revenueCents: sRev,
        profitCents: sRev - sCost,
        averageTicketCents: sCount > 0 ? Math.round(sRev / sCount) : 0,
      };
    });

    // 6. Top 5 productos más rentables y más vendidos del período
    const productsRankRows = await this.ctx.db
      .prepare(
        `SELECT
           p.id AS product_id,
           p.sku,
           p.name,
           p.brand,
           c.name AS category_name,
           p.stock AS current_stock,
           p.cost_cents AS current_cost_cents,
           p.price_cents AS current_price_cents,
           COALESCE(SUM(si.quantity - si.returned_qty), 0) AS units_sold,
           COALESCE(SUM(si.line_total_cents), 0) AS revenue_cents,
           COALESCE(SUM((si.quantity - si.returned_qty) * COALESCE(si.unit_cost_cents, p.cost_cents, 0)), 0) AS cost_cents
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE s.created_at >= ? AND s.created_at <= ? AND s.status <> 'voided'
         GROUP BY p.id
         ORDER BY (revenue_cents - cost_cents) DESC
         LIMIT 20`,
      )
      .bind(from, to)
      .all<any>();

    const allRanked: ProductProfitabilityItem[] = (productsRankRows.results || []).map((r) => {
      const pRev = r.revenue_cents || 0;
      const pCost = r.cost_cents || 0;
      const pProfit = pRev - pCost;
      const pMargin = pRev > 0 ? Math.round((pProfit / pRev) * 1000) / 10 : 0;

      let abcClass: AbcClassification = 'cash_cow';
      if (pMargin >= 35 && pProfit > 500000) abcClass = 'star';
      else if (pMargin < 20 || pProfit < 0) abcClass = 'low_margin';

      return {
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        brand: r.brand,
        categoryName: r.category_name,
        unitsSold: r.units_sold,
        revenueCents: pRev,
        costCents: pCost,
        profitCents: pProfit,
        marginPct: pMargin,
        currentStock: r.current_stock,
        currentCostCents: r.current_cost_cents,
        currentPriceCents: r.current_price_cents,
        abcClass,
      };
    });

    const topProfitableProducts = [...allRanked].sort((a, b) => b.profitCents - a.profitCents).slice(0, 5);
    const topSellingProducts = [...allRanked].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 5);

    // 7. Ranking de Marcas (SKF, FAG, etc.)
    const brandRows = await this.ctx.db
      .prepare(
        `SELECT
           COALESCE(NULLIF(trim(p.brand), ''), 'Sin Marca') AS brand_name,
           COUNT(DISTINCT p.id) AS products_count,
           COALESCE(SUM(si.quantity - si.returned_qty), 0) AS units_sold,
           COALESCE(SUM(si.line_total_cents), 0) AS revenue_cents,
           COALESCE(SUM((si.quantity - si.returned_qty) * COALESCE(si.unit_cost_cents, p.cost_cents, 0)), 0) AS cost_cents
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         WHERE s.created_at >= ? AND s.created_at <= ? AND s.status <> 'voided'
         GROUP BY brand_name
         ORDER BY revenue_cents DESC
         LIMIT 10`,
      )
      .bind(from, to)
      .all<any>();

    const brandRanking: BrandProfitabilityItem[] = (brandRows.results || []).map((r) => {
      const bRev = r.revenue_cents || 0;
      const bCost = r.cost_cents || 0;
      const bProfit = bRev - bCost;
      const bMargin = bRev > 0 ? Math.round((bProfit / bRev) * 1000) / 10 : 0;
      return {
        brand: r.brand_name,
        unitsSold: r.units_sold,
        revenueCents: bRev,
        costCents: bCost,
        profitCents: bProfit,
        marginPct: bMargin,
        productsCount: r.products_count,
      };
    });

    return {
      periodLabel: label,
      from,
      to,
      revenueCents,
      costCents,
      grossProfitCents,
      grossMarginPct,
      salesCount,
      unitsSold,
      averageTicketCents,
      refundedCents,
      dailyTrend,
      byPaymentMethod,
      bySeller,
      topProfitableProducts,
      topSellingProducts,
      brandRanking,
    };
  }

  /**
   * Listado paginado y filtrable de la matriz de rentabilidad de productos.
   */
  async getProductProfitability(
    query: AnalyticsPeriodQuery,
    options: {
      page?: number;
      pageSize?: number;
      sort?: 'profit' | 'revenue' | 'margin' | 'units' | 'name';
      dir?: 'asc' | 'desc';
    } = {},
  ): Promise<{
    items: ProductProfitabilityItem[];
    total: number;
    page: number;
    pageSize: number;
    summary: {
      totalRevenueCents: number;
      totalCostCents: number;
      totalProfitCents: number;
      averageMarginPct: number;
    };
  }> {
    const { from, to } = this.resolvePeriodDates(query);
    const { page = 1, pageSize = 25, sort = 'profit', dir = 'desc' } = options;
    const offset = (page - 1) * pageSize;

    // Filtro por marca o categoría opcional
    const extraConditions: string[] = [];
    const params: any[] = [from, to];

    if (query.brand && query.brand.trim()) {
      extraConditions.push('p.brand = ?');
      params.push(query.brand.trim());
    }
    if (query.categoryId) {
      extraConditions.push('p.category_id = ?');
      params.push(query.categoryId);
    }

    const extraWhere = extraConditions.length > 0 ? ` AND ${extraConditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        p.id AS product_id,
        p.sku,
        p.name,
        p.brand,
        c.name AS category_name,
        p.stock AS current_stock,
        p.cost_cents AS current_cost_cents,
        p.price_cents AS current_price_cents,
        COALESCE(SUM(si.quantity - si.returned_qty), 0) AS units_sold,
        COALESCE(SUM(si.line_total_cents), 0) AS revenue_cents,
        COALESCE(SUM((si.quantity - si.returned_qty) * COALESCE(si.unit_cost_cents, p.cost_cents, 0)), 0) AS cost_cents
      FROM products p
      LEFT JOIN sale_items si ON si.product_id = p.id
      LEFT JOIN sales s ON s.id = si.sale_id AND s.created_at >= ? AND s.created_at <= ? AND s.status <> 'voided'
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.active = 1 ${extraWhere}
      GROUP BY p.id
    `;

    const allProducts = await this.ctx.db.prepare(sql).bind(...params).all<any>();

    const items: ProductProfitabilityItem[] = (allProducts.results || []).map((r) => {
      const pRev = r.revenue_cents || 0;
      const pCost = r.cost_cents || 0;
      const pProfit = pRev - pCost;
      const pMargin = pRev > 0 ? Math.round((pProfit / pRev) * 1000) / 10 : 0;

      let abcClass: AbcClassification = 'cash_cow';
      if (r.units_sold === 0) {
        abcClass = 'slow_moving';
      } else if (pMargin >= 35 && pProfit >= 200000) {
        abcClass = 'star';
      } else if (pMargin < 20 || pProfit < 0) {
        abcClass = 'low_margin';
      }

      return {
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        brand: r.brand,
        categoryName: r.category_name,
        unitsSold: r.units_sold,
        revenueCents: pRev,
        costCents: pCost,
        profitCents: pProfit,
        marginPct: pMargin,
        currentStock: r.current_stock,
        currentCostCents: r.current_cost_cents,
        currentPriceCents: r.current_price_cents,
        abcClass,
      };
    });

    // Ordenamiento en memoria
    const mult = dir === 'desc' ? -1 : 1;
    items.sort((a, b) => {
      if (sort === 'profit') return (a.profitCents - b.profitCents) * mult;
      if (sort === 'revenue') return (a.revenueCents - b.revenueCents) * mult;
      if (sort === 'margin') return (a.marginPct - b.marginPct) * mult;
      if (sort === 'units') return (a.unitsSold - b.unitsSold) * mult;
      return a.name.localeCompare(b.name) * mult;
    });

    const paginatedItems = items.slice(offset, offset + pageSize);
    const totalRevenue = items.reduce((acc, it) => acc + it.revenueCents, 0);
    const totalCost = items.reduce((acc, it) => acc + it.costCents, 0);
    const totalProfit = totalRevenue - totalCost;
    const avgMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0;

    return {
      items: paginatedItems,
      total: items.length,
      page,
      pageSize,
      summary: {
        totalRevenueCents: totalRevenue,
        totalCostCents: totalCost,
        totalProfitCents: totalProfit,
        averageMarginPct: avgMargin,
      },
    };
  }

  /**
   * Exporta la rentabilidad de productos en formato CSV para análisis contable/gerencial.
   */
  async exportCsv(query: AnalyticsPeriodQuery): Promise<string> {
    const data = await this.getProductProfitability(query, { pageSize: 1000, sort: 'profit', dir: 'desc' });

    const headers = [
      'SKU',
      'Producto',
      'Marca',
      'Categoria',
      'Unidades Vendidas',
      'Facturacion Total ($)',
      'Costo Total ($)',
      'Ganancia Bruta ($)',
      'Margen (%)',
      'Stock Actual',
      'Precio Actual ($)',
      'Costo Actual ($)',
      'Clasificacion',
    ];

    const rows = data.items.map((it) => [
      `"${it.sku}"`,
      `"${it.name.replace(/"/g, '""')}"`,
      `"${(it.brand || '').replace(/"/g, '""')}"`,
      `"${(it.categoryName || '').replace(/"/g, '""')}"`,
      it.unitsSold,
      (it.revenueCents / 100).toFixed(2),
      (it.costCents / 100).toFixed(2),
      (it.profitCents / 100).toFixed(2),
      `${it.marginPct}%`,
      it.currentStock,
      (it.currentPriceCents / 100).toFixed(2),
      it.currentCostCents !== null ? (it.currentCostCents / 100).toFixed(2) : '',
      it.abcClass,
    ]);

    return [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  }
}
