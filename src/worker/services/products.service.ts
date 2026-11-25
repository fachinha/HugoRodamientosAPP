import type { ServiceContext } from '../env';
import type { ProductCreateInput, ProductUpdateInput } from '../../shared/schemas';
import { Errors, isConstraintError } from '../lib/errors';
import { auditStmt, nowIso, bool } from '../lib/db';
import { normalizeCode } from '../../shared/barcode';
import { parseSmartSearchQuery } from '../../shared/smartSearch';

export interface ProductListItem {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  brand: string | null;
  categoryId: number | null;
  categoryName: string | null;
  unit: string;
  priceCents: number;
  costCents: number | null;
  stock: number;
  minStock: number | null;
  targetStock: number | null;
  active: boolean;
  barcodes: string[];
  primaryBarcode: string | null;
  lastMovementAt: string | null;
  shelfNumber: string | null;
  shelfLevel: string | null;
  compartment: string | null;
  location: string | null;
  innerDiameterMm: number | null;
  outerDiameterMm: number | null;
  widthMm: number | null;
  dimensions: string | null;
  supplierName: string | null;
  supplierCode: string | null;
  freightPct: number;
  lastPurchaseAt: string | null;
  lastSaleAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListFilter {
  q?: string;
  categoryId?: number;
  brand?: string;
  shelfNumber?: string;
  supplierName?: string;
  status?: 'all' | 'out' | 'low' | 'ok' | 'no_min' | 'alert';
  missing?: 'all' | 'price' | 'cost' | 'location' | 'supplier' | 'brand' | 'dimensions' | 'min_stock';
  active?: '1' | '0' | 'all';
  sort?: 'name' | 'sku' | 'stock' | 'price' | 'updated' | 'brand';
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export class ProductsService {
  constructor(private ctx: ServiceContext) {}

  /**
   * Asegura que exista una categoría por nombre si se proporciona; devuelve su ID.
   */
  private async ensureCategory(categoryName: string | null | undefined): Promise<number | null> {
    if (!categoryName || !categoryName.trim()) return null;
    const name = categoryName.trim();
    const existing = await this.ctx.db
      .prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE')
      .bind(name)
      .first<{ id: number }>();
    if (existing) return existing.id;

    try {
      const res = await this.ctx.db
        .prepare('INSERT INTO categories (name, active) VALUES (?, 1)')
        .bind(name)
        .run();
      return res.meta.last_row_id;
    } catch {
      const retry = await this.ctx.db
        .prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE')
        .bind(name)
        .first<{ id: number }>();
      return retry?.id ?? null;
    }
  }

  async list(filter: ProductListFilter = {}): Promise<{
    items: ProductListItem[];
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

    // Filtro de activo
    if (filter.active === '1' || filter.active === undefined) {
      conditions.push('p.active = 1');
    } else if (filter.active === '0') {
      conditions.push('p.active = 0');
    }

    // Filtro de categoría
    if (filter.categoryId) {
      conditions.push('p.category_id = ?');
      params.push(filter.categoryId);
    }

    // Filtro de marca
    if (filter.brand) {
      conditions.push('p.brand = ? COLLATE NOCASE');
      params.push(filter.brand);
    }

    // Filtro de estado de stock
    if (filter.status === 'out') {
      conditions.push('p.stock = 0');
    } else if (filter.status === 'low') {
      conditions.push('p.stock > 0 AND p.min_stock IS NOT NULL AND p.stock <= p.min_stock');
    } else if (filter.status === 'ok') {
      conditions.push('p.min_stock IS NOT NULL AND p.stock > p.min_stock');
    } else if (filter.status === 'no_min') {
      conditions.push('p.stock > 0 AND p.min_stock IS NULL');
    } else if (filter.status === 'alert') {
      conditions.push('(p.stock = 0 OR (p.min_stock IS NOT NULL AND p.stock <= p.min_stock))');
    }

    // Filtro por estantería
    if (filter.shelfNumber && filter.shelfNumber.trim()) {
      conditions.push('(p.shelf_number = ? OR p.location LIKE ?)');
      params.push(filter.shelfNumber.trim(), `%${filter.shelfNumber.trim()}%`);
    }

    // Filtro por proveedor
    if (filter.supplierName && filter.supplierName.trim()) {
      conditions.push('p.supplier_name LIKE ?');
      params.push(`%${filter.supplierName.trim()}%`);
    }

    // Filtro por datos faltantes (Auditoría post-migración)
    if (filter.missing === 'price') {
      conditions.push('p.price_cents = 0');
    } else if (filter.missing === 'cost') {
      conditions.push('(p.cost_cents IS NULL OR p.cost_cents = 0)');
    } else if (filter.missing === 'location') {
      conditions.push("(p.location IS NULL OR trim(p.location) = '')");
    } else if (filter.missing === 'supplier') {
      conditions.push("(p.supplier_name IS NULL OR trim(p.supplier_name) = '')");
    } else if (filter.missing === 'brand') {
      conditions.push("(p.brand IS NULL OR trim(p.brand) = '')");
    } else if (filter.missing === 'dimensions') {
      conditions.push("(p.dimensions IS NULL OR trim(p.dimensions) = '')");
    } else if (filter.missing === 'min_stock') {
      conditions.push('p.min_stock IS NULL');
    }

    // Búsqueda libre multi-término independiente del orden e insensible a comas/espacios/guiones/variantes fonéticas
    if (filter.q && filter.q.trim()) {
      const parsed = parseSmartSearchQuery(filter.q, 7);

      for (const grp of parsed.groups) {
        const subOr: string[] = [];
        for (const variant of grp.variants) {
          const likePattern = `%${variant}%`;
          subOr.push(
            'p.sku LIKE ?',
            'p.name LIKE ?',
            'p.brand LIKE ?',
            'p.description LIKE ?',
            'p.location LIKE ?',
            'p.dimensions LIKE ?',
            'p.supplier_code LIKE ?',
            'p.supplier_name LIKE ?',
            'EXISTS (SELECT 1 FROM product_barcodes pb WHERE pb.product_id = p.id AND pb.active = 1 AND pb.code LIKE ?)',
          );
          params.push(
            likePattern,
            likePattern,
            likePattern,
            likePattern,
            likePattern,
            likePattern,
            likePattern,
            likePattern,
            likePattern,
          );

          if (grp.isCodeLike) {
            const compactVar = variant.replace(/[^a-z0-9]/gi, '');
            if (compactVar.length >= 3) {
              const compactLike = `%${compactVar}%`;
              subOr.push(
                "REPLACE(REPLACE(REPLACE(REPLACE(p.name, ' ', ''), '-', ''), '.', ''), '/', '') LIKE ?",
                "REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(p.supplier_code, ''), ' ', ''), '-', ''), '.', ''), '/', '') LIKE ?",
              );
              params.push(compactLike, compactLike);
            }
          }
        }
        if (subOr.length > 0) {
          conditions.push(`(${subOr.join(' OR ')})`);
        }
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Orden
    const sortFieldMap: Record<string, string> = {
      name: 'p.name COLLATE NOCASE',
      sku: 'p.sku COLLATE NOCASE',
      stock: 'p.stock',
      price: 'p.price_cents',
      updated: 'p.updated_at',
      brand: 'p.brand COLLATE NOCASE',
    };
    const sortCol = sortFieldMap[filter.sort ?? 'name'] || 'p.name COLLATE NOCASE';
    const sortDir = filter.dir === 'desc' ? 'DESC' : 'ASC';

    // Total
    const countSql = `SELECT COUNT(*) AS total FROM products p ${whereClause}`;
    const countStmt = this.ctx.db.prepare(countSql);
    const countRow = await (params.length > 0 ? countStmt.bind(...params) : countStmt).first<{ total: number }>();
    const total = countRow?.total ?? 0;

    // Items
    const itemsSql = `
      SELECT p.id, p.sku, p.name, p.description, p.brand, p.category_id,
             c.name AS category_name, p.unit, p.price_cents, p.cost_cents,
             p.stock, p.min_stock, p.target_stock, p.active, p.last_movement_at,
             p.shelf_number, p.shelf_level, p.compartment, p.location,
             p.inner_diameter_mm, p.outer_diameter_mm, p.width_mm, p.dimensions,
             p.supplier_name, p.supplier_code, p.freight_pct, p.last_purchase_at, p.last_sale_at,
             p.created_at, p.updated_at
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${whereClause}
      ORDER BY ${sortCol} ${sortDir}, p.id ASC
      LIMIT ? OFFSET ?
    `;
    const itemsParams = [...params, pageSize, offset];
    const { results } = await this.ctx.db.prepare(itemsSql).bind(...itemsParams).all<any>();

    // Obtener códigos de barra activos de los productos resultantes
    const productIds = results.map((r) => r.id);
    const barcodesMap = new Map<number, { all: string[]; primary: string | null }>();

    if (productIds.length > 0) {
      // Chunking if needed, max 100 ids
      const placeholders = productIds.map(() => '?').join(',');
      const barcodesRows = await this.ctx.db
        .prepare(
          `SELECT product_id, code, is_primary
           FROM product_barcodes
           WHERE active = 1 AND product_id IN (${placeholders})
           ORDER BY is_primary DESC, id ASC`,
        )
        .bind(...productIds)
        .all<{ product_id: number; code: string; is_primary: number }>();

      for (const row of barcodesRows.results) {
        let entry = barcodesMap.get(row.product_id);
        if (!entry) {
          entry = { all: [], primary: null };
          barcodesMap.set(row.product_id, entry);
        }
        entry.all.push(row.code);
        if (row.is_primary === 1 && !entry.primary) {
          entry.primary = row.code;
        }
      }
    }

    const items: ProductListItem[] = results.map((r) => {
      const bInfo = barcodesMap.get(r.id);
      return {
        id: r.id,
        sku: r.sku,
        name: r.name,
        description: r.description,
        brand: r.brand,
        categoryId: r.category_id,
        categoryName: r.category_name,
        unit: r.unit,
        priceCents: r.price_cents,
        costCents: this.ctx.user.role === 'admin' ? r.cost_cents : null, // Costo visible solo a admin
        stock: r.stock,
        minStock: r.min_stock,
        targetStock: r.target_stock,
        active: bool(r.active),
        barcodes: bInfo?.all ?? [],
        primaryBarcode: bInfo?.primary ?? (bInfo?.all[0] || null),
        lastMovementAt: r.last_movement_at,
        shelfNumber: r.shelf_number ?? null,
        shelfLevel: r.shelf_level ?? null,
        compartment: r.compartment ?? null,
        location: r.location ?? null,
        innerDiameterMm: r.inner_diameter_mm ?? null,
        outerDiameterMm: r.outer_diameter_mm ?? null,
        widthMm: r.width_mm ?? null,
        dimensions: r.dimensions ?? null,
        supplierName: r.supplier_name ?? null,
        supplierCode: r.supplier_code ?? null,
        freightPct: r.freight_pct ?? 0,
        lastPurchaseAt: r.last_purchase_at ?? null,
        lastSaleAt: r.last_sale_at ?? null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async getById(id: number): Promise<ProductListItem> {
    const r = await this.ctx.db
      .prepare(
        `SELECT p.id, p.sku, p.name, p.description, p.brand, p.category_id,
                c.name AS category_name, p.unit, p.price_cents, p.cost_cents,
                p.stock, p.min_stock, p.target_stock, p.active, p.last_movement_at,
                p.shelf_number, p.shelf_level, p.compartment, p.location,
                p.inner_diameter_mm, p.outer_diameter_mm, p.width_mm, p.dimensions,
                p.supplier_name, p.supplier_code, p.freight_pct, p.last_purchase_at, p.last_sale_at,
                p.created_at, p.updated_at
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.id = ?`,
      )
      .bind(id)
      .first<any>();

    if (!r) throw Errors.notFound('El producto');

    const barcodes = await this.ctx.db
      .prepare(
        `SELECT code, is_primary FROM product_barcodes
         WHERE product_id = ? AND active = 1
         ORDER BY is_primary DESC, id ASC`,
      )
      .bind(id)
      .all<{ code: string; is_primary: number }>();

    const all = barcodes.results.map((b) => b.code);
    const primary = barcodes.results.find((b) => b.is_primary === 1)?.code || all[0] || null;

    return {
      id: r.id,
      sku: r.sku,
      name: r.name,
      description: r.description,
      brand: r.brand,
      categoryId: r.category_id,
      categoryName: r.category_name,
      unit: r.unit,
      priceCents: r.price_cents,
      costCents: this.ctx.user.role === 'admin' ? r.cost_cents : null,
      stock: r.stock,
      minStock: r.min_stock,
      targetStock: r.target_stock,
      active: bool(r.active),
      barcodes: all,
      primaryBarcode: primary,
      lastMovementAt: r.last_movement_at,
      shelfNumber: r.shelf_number ?? null,
      shelfLevel: r.shelf_level ?? null,
      compartment: r.compartment ?? null,
      location: r.location ?? null,
      innerDiameterMm: r.inner_diameter_mm ?? null,
      outerDiameterMm: r.outer_diameter_mm ?? null,
      widthMm: r.width_mm ?? null,
      dimensions: r.dimensions ?? null,
      supplierName: r.supplier_name ?? null,
      supplierCode: r.supplier_code ?? null,
      freightPct: r.freight_pct ?? 0,
      lastPurchaseAt: r.last_purchase_at ?? null,
      lastSaleAt: r.last_sale_at ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  /**
   * Búsqueda precisa por código de barras, SKU o código de proveedor.
   */
  async getByCode(codeRaw: string): Promise<ProductListItem | null> {
    const code = normalizeCode(codeRaw);
    if (!code) return null;

    // 1. Buscar coincidencia exacta en códigos de barra activos
    const byBarcode = await this.ctx.db
      .prepare(
        `SELECT product_id FROM product_barcodes
         WHERE code = ? AND active = 1
         LIMIT 1`,
      )
      .bind(code)
      .first<{ product_id: number }>();

    if (byBarcode) {
      return this.getById(byBarcode.product_id);
    }

    // 2. Buscar por SKU exacto
    const bySku = await this.ctx.db
      .prepare('SELECT id FROM products WHERE sku = ? COLLATE NOCASE LIMIT 1')
      .bind(code)
      .first<{ id: number }>();

    if (bySku) {
      return this.getById(bySku.id);
    }

    // 3. Buscar por código de proveedor exacto
    const bySupplierCode = await this.ctx.db
      .prepare('SELECT id FROM products WHERE supplier_code = ? COLLATE NOCASE LIMIT 1')
      .bind(code)
      .first<{ id: number }>();

    if (bySupplierCode) {
      return this.getById(bySupplierCode.id);
    }

    return null;
  }

  async create(data: ProductCreateInput): Promise<ProductListItem> {
    const categoryId = await this.ensureCategory(data.categoryName);
    const now = nowIso();
    const initialStock = data.initialStock ?? 0;
    const normBarcodes = (data.barcodes || []).map(normalizeCode).filter(Boolean);

    // Calcular ubicación y medidas normalizadas si no vienen explícitas
    const computedLocation =
      data.location?.trim() ||
      [data.shelfNumber?.trim(), data.shelfLevel?.trim(), data.compartment?.trim()].filter(Boolean).join('-') ||
      null;

    const computedDimensions =
      data.dimensions?.trim() ||
      (data.innerDiameterMm && data.outerDiameterMm
        ? `${data.innerDiameterMm}x${data.outerDiameterMm}${data.widthMm ? 'x' + data.widthMm : ''} mm`
        : null);

    // Validar si algún código de barra ya existe activo en la base
    if (normBarcodes.length > 0) {
      const placeholders = normBarcodes.map(() => '?').join(',');
      const existingBarcodes = await this.ctx.db
        .prepare(`SELECT code, product_id FROM product_barcodes WHERE active = 1 AND code IN (${placeholders})`)
        .bind(...normBarcodes)
        .all<{ code: string; product_id: number }>();

      if (existingBarcodes.results.length > 0) {
        const conflict = existingBarcodes.results[0];
        throw Errors.conflict(
          'BARCODE_ALREADY_EXISTS',
          `El código de barras "${conflict.code}" ya está asignado a otro producto activo.`,
          { code: conflict.code, existingProductId: conflict.product_id },
        );
      }
    }

    // Validar SKU único
    const existingSku = await this.ctx.db
      .prepare('SELECT id FROM products WHERE sku = ? COLLATE NOCASE')
      .bind(data.sku)
      .first<{ id: number }>();

    if (existingSku) {
      throw Errors.conflict('SKU_ALREADY_EXISTS', `El SKU / código interno "${data.sku}" ya está registrado.`);
    }

    // Usar batch atómico para producto + barcodes + movimiento inicial
    const stmts: D1PreparedStatement[] = [];

    // 1. Insert product
    stmts.push(
      this.ctx.db
        .prepare(
          `INSERT INTO products (
            sku, name, description, brand, category_id, unit, price_cents, cost_cents,
            stock, min_stock, target_stock, active, last_movement_at,
            shelf_number, shelf_level, compartment, location,
            inner_diameter_mm, outer_diameter_mm, width_mm, dimensions,
            supplier_name, supplier_code, freight_pct, last_purchase_at, last_sale_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          data.sku,
          data.name,
          data.description ?? null,
          data.brand ?? null,
          categoryId,
          data.unit ?? 'unidad',
          data.priceCents,
          data.costCents ?? null,
          initialStock,
          data.minStock ?? null,
          data.targetStock ?? null,
          initialStock > 0 ? now : null,
          data.shelfNumber?.trim() || null,
          data.shelfLevel?.trim() || null,
          data.compartment?.trim() || null,
          computedLocation,
          data.innerDiameterMm ?? null,
          data.outerDiameterMm ?? null,
          data.widthMm ?? null,
          computedDimensions,
          data.supplierName?.trim() || null,
          data.supplierCode?.trim() || null,
          data.freightPct ?? 0,
          data.lastPurchaseAt?.trim() || (initialStock > 0 ? now : null),
          data.lastSaleAt?.trim() || null,
          now,
          now,
        ),
    );

    // En D1, las sentencias preparadas en el batch se ejecutan secuencialmente.
    // Sin embargo, para vincular el ID generado necesitamos el insert primero.
    // Ejecutamos el insert del producto y luego el resto en batch si corresponde.
    try {
      const res = await stmts[0].run();
      const productId = res.meta.last_row_id;

      const subStmts: D1PreparedStatement[] = [];

      // Códigos de barra
      normBarcodes.forEach((code, idx) => {
        subStmts.push(
          this.ctx.db
            .prepare(
              `INSERT INTO product_barcodes (product_id, code, is_primary, active, created_at)
               VALUES (?, ?, ?, 1, ?)`,
            )
            .bind(productId, code, idx === 0 ? 1 : 0, now),
        );
      });

      // Movimiento inicial si hay stock inicial
      if (initialStock > 0) {
        subStmts.push(
          this.ctx.db
            .prepare(
              `INSERT INTO stock_movements (
                product_id, type, quantity, stock_before, stock_after, user_id, reason, ref_type, created_at
              ) VALUES (?, 'initial', ?, 0, ?, ?, 'Carga inicial al crear producto', 'manual', ?)`,
            )
            .bind(productId, initialStock, initialStock, this.ctx.user.id, now),
        );
      }

      // Auditoría
      subStmts.push(
        auditStmt(this.ctx, 'product.create', 'products', productId, {
          sku: data.sku,
          name: data.name,
          initialStock,
          location: computedLocation,
        }),
      );

      if (subStmts.length > 0) {
        await this.ctx.db.batch(subStmts);
      }

      return this.getById(productId);
    } catch (e: any) {
      if (isConstraintError(e, 'UNIQUE', 'products.sku')) {
        throw Errors.conflict('SKU_ALREADY_EXISTS', `El SKU "${data.sku}" ya está registrado.`);
      }
      throw e;
    }
  }

  async update(id: number, data: ProductUpdateInput): Promise<ProductListItem> {
    const existing = await this.getById(id);
    const categoryId = await this.ensureCategory(data.categoryName);
    const now = nowIso();
    const normBarcodes = (data.barcodes || []).map(normalizeCode).filter(Boolean);

    const computedLocation =
      data.location?.trim() ||
      [data.shelfNumber?.trim(), data.shelfLevel?.trim(), data.compartment?.trim()].filter(Boolean).join('-') ||
      null;

    const computedDimensions =
      data.dimensions?.trim() ||
      (data.innerDiameterMm && data.outerDiameterMm
        ? `${data.innerDiameterMm}x${data.outerDiameterMm}${data.widthMm ? 'x' + data.widthMm : ''} mm`
        : null);

    // Validar SKU no duplicado en otro producto
    if (data.sku.toLowerCase() !== existing.sku.toLowerCase()) {
      const checkSku = await this.ctx.db
        .prepare('SELECT id FROM products WHERE sku = ? COLLATE NOCASE AND id <> ?')
        .bind(data.sku, id)
        .first<{ id: number }>();
      if (checkSku) {
        throw Errors.conflict('SKU_ALREADY_EXISTS', `El SKU "${data.sku}" ya pertenece a otro producto.`);
      }
    }

    // Validar barcodes no asignados a otros productos
    if (normBarcodes.length > 0) {
      const placeholders = normBarcodes.map(() => '?').join(',');
      const checkBarcodes = await this.ctx.db
        .prepare(
          `SELECT code, product_id FROM product_barcodes
           WHERE active = 1 AND product_id <> ? AND code IN (${placeholders})`,
        )
        .bind(id, ...normBarcodes)
        .all<{ code: string; product_id: number }>();

      if (checkBarcodes.results.length > 0) {
        const conflict = checkBarcodes.results[0];
        throw Errors.conflict(
          'BARCODE_ALREADY_EXISTS',
          `El código "${conflict.code}" ya está asignado a otro producto activo.`,
          { code: conflict.code, existingProductId: conflict.product_id },
        );
      }
    }

    const batch: D1PreparedStatement[] = [];

    // 1. Actualizar producto (STOCK NO SE TOCA AQUÍ)
    batch.push(
      this.ctx.db
        .prepare(
          `UPDATE products SET
            sku = ?, name = ?, description = ?, brand = ?, category_id = ?,
            unit = ?, price_cents = ?, cost_cents = ?, min_stock = ?, target_stock = ?,
            shelf_number = ?, shelf_level = ?, compartment = ?, location = ?,
            inner_diameter_mm = ?, outer_diameter_mm = ?, width_mm = ?, dimensions = ?,
            supplier_name = ?, supplier_code = ?, freight_pct = ?,
            last_purchase_at = COALESCE(?, last_purchase_at),
            last_sale_at = COALESCE(?, last_sale_at),
            updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          data.sku,
          data.name,
          data.description ?? null,
          data.brand ?? null,
          categoryId,
          data.unit ?? 'unidad',
          data.priceCents,
          data.costCents ?? null,
          data.minStock ?? null,
          data.targetStock ?? null,
          data.shelfNumber?.trim() || null,
          data.shelfLevel?.trim() || null,
          data.compartment?.trim() || null,
          computedLocation,
          data.innerDiameterMm ?? null,
          data.outerDiameterMm ?? null,
          data.widthMm ?? null,
          computedDimensions,
          data.supplierName?.trim() || null,
          data.supplierCode?.trim() || null,
          data.freightPct ?? 0,
          data.lastPurchaseAt?.trim() || null,
          data.lastSaleAt?.trim() || null,
          now,
          id,
        ),
    );

    // 2. Reemplazar códigos de barra: desactivar anteriores y agregar nuevos
    batch.push(
      this.ctx.db
        .prepare('UPDATE product_barcodes SET active = 0 WHERE product_id = ?')
        .bind(id),
    );

    normBarcodes.forEach((code, idx) => {
      batch.push(
        this.ctx.db
          .prepare(
            `INSERT INTO product_barcodes (product_id, code, is_primary, active, created_at)
             VALUES (?, ?, ?, 1, ?)`,
          )
          .bind(id, code, idx === 0 ? 1 : 0, now),
      );
    });

    batch.push(
      auditStmt(this.ctx, 'product.update', 'products', id, {
        sku: data.sku,
        name: data.name,
        priceCents: data.priceCents,
        costCents: data.costCents,
        location: computedLocation,
      }),
    );

    await this.ctx.db.batch(batch);
    return this.getById(id);
  }

  async setActive(id: number, active: boolean): Promise<ProductListItem> {
    const existing = await this.getById(id);
    const now = nowIso();

    const batch = [
      this.ctx.db
        .prepare('UPDATE products SET active = ?, updated_at = ? WHERE id = ?')
        .bind(active ? 1 : 0, now, id),
      // Si se desactiva el producto, también se desactivan sus códigos para no bloquear reasignaciones si hiciera falta
      this.ctx.db
        .prepare('UPDATE product_barcodes SET active = ? WHERE product_id = ?')
        .bind(active ? 1 : 0, id),
      auditStmt(this.ctx, active ? 'product.activate' : 'product.deactivate', 'products', id, {
        sku: existing.sku,
      }),
    ];

    await this.ctx.db.batch(batch);
    return this.getById(id);
  }

  /**
   * Genera o enriquece la descripción técnica, aplicaciones vehiculares y códigos equivalentes de un producto usando IA + cruce en D1.
   */
  async generateAiDescription(input: {
    sku?: string;
    name?: string;
    brand?: string | null;
    dimensions?: string | null;
    supplierName?: string | null;
    supplierCode?: string | null;
  }): Promise<{
    description: string;
    suggestedBrand: string | null;
    suggestedCategory: string | null;
    aiModelUsed: string;
  }> {
    const sku = (input.sku || '').trim();
    const name = (input.name || '').trim();
    const brand = (input.brand || '').trim() || null;
    const dimensions = (input.dimensions || '').trim() || null;
    const supplierName = (input.supplierName || '').trim() || null;
    const supplierCode = (input.supplierCode || '').trim() || null;

    if (!sku && !name && !supplierCode) {
      throw Errors.badRequest('Ingresá al menos el código o nombre del producto para generar la descripción.');
    }

    // Buscar referencias reales en supplier_catalog_items o productos hermanos
    const codeKey = (supplierCode || sku || name.split(/[\s-(]+/)[0] || '').replace(/[^A-Za-z0-9]/g, '');
    let dbContextLines: string[] = [];
    if (codeKey.length >= 3) {
      const catHits = await this.ctx.db
        .prepare(
          `SELECT supplier_name, brand, category, code, name, application
           FROM supplier_catalog_items
           WHERE REPLACE(REPLACE(code, ' ', ''), '-', '') LIKE ? OR name LIKE ?
           LIMIT 5`,
        )
        .bind(`%${codeKey}%`, `%${codeKey}%`)
        .all<any>();
      for (const r of catHits.results || []) {
        dbContextLines.push(`[${r.supplier_name} · ${r.brand}] ${r.code}: ${r.name} — ${r.application || ''}`);
      }
    }

    if (this.ctx.geminiApiKey && this.ctx.geminiApiKey !== 'tu-gemini-api-key-aqui') {
      const models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-lite-latest'];
      const prompt = `Sos un especialista técnico de mostrador en 'Rodamientos Hugo' (Bariloche, Argentina).
Redactá una descripción técnica comercial clara, buscable y precisa para este artículo de repuestos / rodamientos:
- SKU: ${sku || 'S/D'}
- Código proveedor: ${supplierCode || 'S/D'}
- Nombre: ${name || 'S/D'}
- Marca: ${brand || 'S/D'}
- Medidas: ${dimensions || 'S/D'}
- Proveedor: ${supplierName || 'S/D'}
${dbContextLines.length > 0 ? `\nReferencias en catálogos oficiales:\n${dbContextLines.join('\n')}` : ''}

Reglas:
1. Incluí: tipo de pieza exacto (ej: Bomba de Agua Automotor, Kit de Distribución, Rulemán rígido de bolas, Retén), vehículos/motores compatibles si se conocen con certeza, códigos equivalentes en otras marcas habituales en Argentina (SKF, DOLZ, VMG, CHIVILCOY, INA, GATES, DAYCO, SAV, DBH) y medidas si aplica.
2. No uses frases publicitarias genéricas; escribí datos técnicos concretos para que el buscador encuentre el artículo por auto, motor, código o medida (máximo 350 caracteres).`;

      for (const m of models) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(this.ctx.geminiApiKey)}`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: 'OBJECT',
                  properties: {
                    description: { type: 'STRING' },
                    suggestedBrand: { type: 'STRING', nullable: true },
                    suggestedCategory: { type: 'STRING', nullable: true },
                  },
                  required: ['description'],
                },
              },
            }),
            signal: AbortSignal.timeout(7000),
          });
          if (res.ok) {
            const data: any = await res.json();
            const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (txt) {
              const parsed = JSON.parse(txt);
              if (parsed.description) {
                return {
                  description: String(parsed.description).trim(),
                  suggestedBrand: parsed.suggestedBrand || brand,
                  suggestedCategory: parsed.suggestedCategory || null,
                  aiModelUsed: m,
                };
              }
            }
          }
        } catch {
          // Intentar siguiente modelo
        }
      }
    }

    // Fallback determinístico con datos técnicos locales
    const parts: string[] = [];
    if (name) parts.push(name);
    if (dbContextLines.length > 0) parts.push(dbContextLines[0]);
    if (dimensions) parts.push(`Medidas: ${dimensions} mm`);
    if (brand) parts.push(`Marca: ${brand}`);
    if (supplierName) parts.push(`Proveedor: ${supplierName}`);

    return {
      description: parts.join(' · ').slice(0, 500),
      suggestedBrand: brand,
      suggestedCategory: null,
      aiModelUsed: 'motor-tecnico-local',
    };
  }
}
