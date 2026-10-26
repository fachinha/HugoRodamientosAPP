import type { ServiceContext } from '../env';
import type { ProductCreateInput, ProductUpdateInput } from '../../shared/schemas';
import { Errors, isConstraintError } from '../lib/errors';
import { auditStmt, nowIso, bool } from '../lib/db';
import { normalizeCode } from '../../shared/barcode';

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
  createdAt: string;
  updatedAt: string;
}

export interface ProductListFilter {
  q?: string;
  categoryId?: number;
  brand?: string;
  status?: 'all' | 'out' | 'low' | 'ok' | 'no_min' | 'alert';
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

    // Búsqueda libre (q)
    if (filter.q && filter.q.trim()) {
      const q = filter.q.trim();
      const likePattern = `%${q}%`;
      conditions.push(`(
        p.sku LIKE ? OR
        p.name LIKE ? OR
        p.brand LIKE ? OR
        EXISTS (
          SELECT 1 FROM product_barcodes pb
          WHERE pb.product_id = p.id AND pb.active = 1 AND pb.code LIKE ?
        )
      )`);
      params.push(likePattern, likePattern, likePattern, likePattern);
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
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  /**
   * Búsqueda precisa por código de barras o SKU (usado por el lector HID o teclado).
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

    return null;
  }

  async create(data: ProductCreateInput): Promise<ProductListItem> {
    const categoryId = await this.ensureCategory(data.categoryName);
    const now = nowIso();
    const initialStock = data.initialStock ?? 0;
    const normBarcodes = (data.barcodes || []).map(normalizeCode).filter(Boolean);

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
            stock, min_stock, target_stock, active, last_movement_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
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

    // 3. Auditoría
    batch.push(
      auditStmt(this.ctx, 'product.update', 'products', id, {
        sku: data.sku,
        name: data.name,
        priceCents: data.priceCents,
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
}
