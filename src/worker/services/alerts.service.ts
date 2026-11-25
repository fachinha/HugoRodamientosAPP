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

export interface DataQualityReport {
  products: {
    totalActive: number;
    missingPrice: number;
    missingCost: number;
    missingLocation: number;
    missingSupplier: number;
    missingBrand: number;
    missingDimensions: number;
    pendingPhysicalStockCount: number;
    samplesMissingPrice: {
      id: number;
      sku: string;
      name: string;
      brand: string | null;
      supplierName: string | null;
    }[];
  };
  customers: {
    totalCustomers: number;
    missingPhone: number;
    missingEmail: number;
    missingCuit: number;
    debtorsMissingContact: {
      id: number;
      name: string;
      customerType: string;
      balanceCents: number;
      missingPhone: boolean;
      missingEmail: boolean;
      missingCuit: boolean;
    }[];
  };
  suppliers: {
    totalSuppliers: number;
    missingPhone: number;
    missingEmail: number;
    missingCuit: number;
    incompleteSuppliers: {
      id: number;
      name: string;
      city: string | null;
      brandsSupplied: string | null;
      missingPhone: boolean;
      missingEmail: boolean;
      missingCuit: boolean;
    }[];
  };
  totalActionableIssues: number;
}

export class AlertsService {
  constructor(private ctx: ServiceContext) {}

  async getSummary(): Promise<{
    outOfStock: number;
    lowStock: number;
    undefinedMin: number;
    uncountedMigratedStock: number;
    missingDataCriticalCount: number;
    totalRequiringAttention: number;
  }> {
    const [row, custRow, supRow] = await Promise.all([
      this.ctx.db
        .prepare(
          `SELECT
            SUM(CASE WHEN stock = 0 AND (min_stock IS NOT NULL OR last_movement_at IS NOT NULL) THEN 1 ELSE 0 END) AS out_count,
            SUM(CASE WHEN stock > 0 AND min_stock IS NOT NULL AND stock <= min_stock THEN 1 ELSE 0 END) AS low_count,
            SUM(CASE WHEN stock > 0 AND min_stock IS NULL THEN 1 ELSE 0 END) AS no_min_count,
            SUM(CASE WHEN stock = 0 AND min_stock IS NULL AND last_movement_at IS NULL AND (last_purchase_at IS NOT NULL OR last_sale_at IS NOT NULL OR id <= 7050) THEN 1 ELSE 0 END) AS uncounted_count,
            SUM(CASE WHEN price_cents = 0 AND (stock > 0 OR last_movement_at IS NOT NULL OR last_purchase_at IS NOT NULL OR last_sale_at IS NOT NULL OR COALESCE(supplier_name, '') <> 'BRAMCO') THEN 1 ELSE 0 END) AS missing_price_count
           FROM products
           WHERE active = 1`,
        )
        .first<{
          out_count: number | null;
          low_count: number | null;
          no_min_count: number | null;
          uncounted_count: number | null;
          missing_price_count: number | null;
        }>(),
      this.ctx.db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM customers WHERE phone IS NULL OR trim(phone) = ''`,
        )
        .first<{ cnt: number | null }>(),
      this.ctx.db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM suppliers WHERE active = 1 AND (phone IS NULL OR trim(phone) = '')`,
        )
        .first<{ cnt: number | null }>(),
    ]);

    const outOfStock = row?.out_count ?? 0;
    const lowStock = row?.low_count ?? 0;
    const undefinedMin = row?.no_min_count ?? 0;
    const uncountedMigratedStock = row?.uncounted_count ?? 0;
    const missingDataCriticalCount =
      (row?.missing_price_count ?? 0) + (custRow?.cnt ?? 0) + (supRow?.cnt ?? 0);

    return {
      outOfStock,
      lowStock,
      undefinedMin,
      uncountedMigratedStock,
      missingDataCriticalCount,
      totalRequiringAttention: outOfStock + lowStock,
    };
  }

  async getDataQualityReport(): Promise<DataQualityReport> {
    const [prodStats, samplesMissingPrice, custStats, debtorsMissing, supStats, incompleteSups] =
      await Promise.all([
        this.ctx.db
          .prepare(
            `SELECT
              COUNT(*) AS total_active,
              SUM(CASE WHEN price_cents = 0 AND (stock > 0 OR last_movement_at IS NOT NULL OR last_purchase_at IS NOT NULL OR last_sale_at IS NOT NULL OR COALESCE(supplier_name, '') <> 'BRAMCO') THEN 1 ELSE 0 END) AS missing_price,
              SUM(CASE WHEN (cost_cents IS NULL OR cost_cents = 0) AND (stock > 0 OR last_movement_at IS NOT NULL OR last_purchase_at IS NOT NULL OR last_sale_at IS NOT NULL OR COALESCE(supplier_name, '') <> 'BRAMCO') THEN 1 ELSE 0 END) AS missing_cost,
              SUM(CASE WHEN (location IS NULL OR trim(location) = '') AND (stock > 0 OR last_movement_at IS NOT NULL OR last_purchase_at IS NOT NULL OR last_sale_at IS NOT NULL OR id <= 7050) THEN 1 ELSE 0 END) AS missing_location,
              SUM(CASE WHEN supplier_name IS NULL OR trim(supplier_name) = '' THEN 1 ELSE 0 END) AS missing_supplier,
              SUM(CASE WHEN brand IS NULL OR trim(brand) = '' THEN 1 ELSE 0 END) AS missing_brand,
              SUM(CASE WHEN (dimensions IS NULL OR trim(dimensions) = '') AND id <= 7050 THEN 1 ELSE 0 END) AS missing_dimensions,
              SUM(CASE WHEN stock = 0 AND min_stock IS NULL AND last_movement_at IS NULL AND (last_purchase_at IS NOT NULL OR last_sale_at IS NOT NULL OR id <= 7050) THEN 1 ELSE 0 END) AS pending_stock
             FROM products
             WHERE active = 1`,
          )
          .first<any>(),
        this.ctx.db
          .prepare(
            `SELECT id, sku, name, brand, supplier_name
             FROM products
             WHERE active = 1 AND price_cents = 0 AND (stock > 0 OR last_movement_at IS NOT NULL OR last_purchase_at IS NOT NULL OR last_sale_at IS NOT NULL OR COALESCE(supplier_name, '') <> 'BRAMCO')
             ORDER BY id ASC
             LIMIT 12`,
          )
          .all<any>(),
        this.ctx.db
          .prepare(
            `SELECT
              COUNT(*) AS total_customers,
              SUM(CASE WHEN phone IS NULL OR trim(phone) = '' THEN 1 ELSE 0 END) AS missing_phone,
              SUM(CASE WHEN email IS NULL OR trim(email) = '' THEN 1 ELSE 0 END) AS missing_email,
              SUM(CASE WHEN cuit IS NULL OR trim(cuit) = '' OR cuit = '00-00000000-0' THEN 1 ELSE 0 END) AS missing_cuit
             FROM customers`,
          )
          .first<any>(),
        this.ctx.db
          .prepare(
            `SELECT
              c.id, c.name, c.customer_type, c.phone, c.email, c.cuit,
              COALESCE(SUM(CASE WHEN m.movement_type = 'commitment' THEN m.amount_cents ELSE -m.amount_cents END), 0) AS balance_cents
             FROM customers c
             LEFT JOIN customer_account_movements m ON m.customer_id = c.id
             WHERE (c.phone IS NULL OR trim(c.phone) = '' OR c.email IS NULL OR trim(c.email) = '')
             GROUP BY c.id
             HAVING balance_cents > 0
             ORDER BY balance_cents DESC
             LIMIT 15`,
          )
          .all<any>(),
        this.ctx.db
          .prepare(
            `SELECT
              COUNT(*) AS total_suppliers,
              SUM(CASE WHEN phone IS NULL OR trim(phone) = '' THEN 1 ELSE 0 END) AS missing_phone,
              SUM(CASE WHEN email IS NULL OR trim(email) = '' THEN 1 ELSE 0 END) AS missing_email,
              SUM(CASE WHEN cuit IS NULL OR trim(cuit) = '' THEN 1 ELSE 0 END) AS missing_cuit
             FROM suppliers
             WHERE active = 1`,
          )
          .first<any>(),
        this.ctx.db
          .prepare(
            `SELECT id, name, city, brands_supplied, phone, email, cuit
             FROM suppliers
             WHERE active = 1
               AND (phone IS NULL OR trim(phone) = '' OR email IS NULL OR trim(email) = '' OR cuit IS NULL OR trim(cuit) = '')
             ORDER BY name COLLATE NOCASE ASC`,
          )
          .all<any>(),
      ]);

    const missingPrice = prodStats?.missing_price ?? 0;
    const custMissingPhone = custStats?.missing_phone ?? 0;
    const supMissingPhone = supStats?.missing_phone ?? 0;

    return {
      products: {
        totalActive: prodStats?.total_active ?? 0,
        missingPrice,
        missingCost: prodStats?.missing_cost ?? 0,
        missingLocation: prodStats?.missing_location ?? 0,
        missingSupplier: prodStats?.missing_supplier ?? 0,
        missingBrand: prodStats?.missing_brand ?? 0,
        missingDimensions: prodStats?.missing_dimensions ?? 0,
        pendingPhysicalStockCount: prodStats?.pending_stock ?? 0,
        samplesMissingPrice: (samplesMissingPrice.results || []).map((r: any) => ({
          id: r.id,
          sku: r.sku,
          name: r.name,
          brand: r.brand ?? null,
          supplierName: r.supplier_name ?? null,
        })),
      },
      customers: {
        totalCustomers: custStats?.total_customers ?? 0,
        missingPhone: custMissingPhone,
        missingEmail: custStats?.missing_email ?? 0,
        missingCuit: custStats?.missing_cuit ?? 0,
        debtorsMissingContact: (debtorsMissing.results || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          customerType: r.customer_type,
          balanceCents: r.balance_cents,
          missingPhone: !r.phone || !String(r.phone).trim(),
          missingEmail: !r.email || !String(r.email).trim(),
          missingCuit: !r.cuit || !String(r.cuit).trim() || r.cuit === '00-00000000-0',
        })),
      },
      suppliers: {
        totalSuppliers: supStats?.total_suppliers ?? 0,
        missingPhone: supMissingPhone,
        missingEmail: supStats?.missing_email ?? 0,
        missingCuit: supStats?.missing_cuit ?? 0,
        incompleteSuppliers: (incompleteSups.results || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          city: r.city ?? null,
          brandsSupplied: r.brands_supplied ?? null,
          missingPhone: !r.phone || !String(r.phone).trim(),
          missingEmail: !r.email || !String(r.email).trim(),
          missingCuit: !r.cuit || !String(r.cuit).trim(),
        })),
      },
      totalActionableIssues: missingPrice + custMissingPhone + supMissingPhone,
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
    summary: {
      outOfStock: number;
      lowStock: number;
      undefinedMin: number;
      uncountedMigratedStock: number;
      missingDataCriticalCount: number;
      totalRequiringAttention: number;
    };
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const summary = await this.getSummary();

    const factorRow = await this.ctx.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .bind('replenishment_fallback_factor')
      .first<{ value: string }>();
    const fallbackFactor = factorRow ? Number(JSON.parse(factorRow.value)) : 2;

    const conditions: string[] = ['p.active = 1'];
    const params: unknown[] = [];

    if (filter.status === 'out') {
      conditions.push('p.stock = 0 AND (p.min_stock IS NOT NULL OR p.last_movement_at IS NOT NULL)');
    } else if (filter.status === 'low') {
      conditions.push('p.stock > 0 AND p.min_stock IS NOT NULL AND p.stock <= p.min_stock');
    } else if (filter.status === 'no_min') {
      conditions.push('p.stock > 0 AND p.min_stock IS NULL');
    } else {
      conditions.push(
        '((p.stock = 0 AND (p.min_stock IS NOT NULL OR p.last_movement_at IS NOT NULL)) OR (p.min_stock IS NOT NULL AND p.stock <= p.min_stock))',
      );
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

      const priorityLabel =
        priority === 1 ? 'Urgente (Agotado)' : priority === 2 ? 'Alta (Bajo)' : 'Definir mínimo';

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
        statusLabel:
          status === 'out' ? 'Agotado' : status === 'low' ? 'Stock bajo' : 'Mínimo sin definir',
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
