import type { ServiceContext } from '../env';
import { Errors } from '../lib/errors';
import { auditStmt, nowIso, bool } from '../lib/db';
import { parseSmartSearchQuery } from '../../shared/smartSearch';
import {
  type SupplierCreateInput,
  type SupplierUpdateInput,
  type SupplierDetail,
  type ProductSupplierOptionInput,
  type SupplierOptionComparison,
  type ReplenishmentCandidateItem,
  type ReplenishmentOriginReason,
  type PurchaseOrderCreateInput,
  type PurchaseOrderStatusUpdateInput,
  type PurchaseOrderDetail,
} from '../../shared/replenishment';

function extractTechnicalSearchCodes(sku: string, name: string, supplierCode: string | null): string[] {
  const codes: string[] = [];
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    const clean = raw.trim().toUpperCase();
    if (clean.length >= 4 && !/^\d{1,5}$/.test(clean)) {
      if (!codes.includes(clean)) codes.push(clean);
      const compact = clean.replace(/[\s-]+/g, '');
      if (compact.length >= 4 && !/^\d{1,5}$/.test(compact) && !codes.includes(compact)) {
        codes.push(compact);
      }
    }
  };

  add(supplierCode);
  if (!/^\d+$/.test(sku.trim())) {
    add(sku);
  }
  const lead = (name || '').trim().split(/\s+-\s+|\s+\(|\s+\[|\s+/)[0] || '';
  if (/\d/.test(lead)) {
    add(lead);
  }
  const parenMatches = (name || '').match(/\(([^)]{4,32})\)/g) || [];
  for (const pm of parenMatches) {
    for (const part of pm.slice(1, -1).split(/[/,\s]+/)) {
      if (/\d/.test(part)) add(part);
    }
  }
  return codes.slice(0, 4);
}

export class ReplenishmentService {
  constructor(private ctx: ServiceContext) {}

  private async getNextOrderNumber(): Promise<string> {
    const row = await this.ctx.db
      .prepare('SELECT MAX(id) as max_id FROM supplier_purchase_orders')
      .first<{ max_id: number | null }>();
    const nextId = (row?.max_id || 0) + 1;
    return `PED-${String(nextId).padStart(5, '0')}`;
  }

  /**
   * 1. Lista todos los proveedores activos con cantidad de artículos vinculados, % de flete y demora a Bariloche.
   */
  async listSuppliers(): Promise<SupplierDetail[]> {
    const [rows, optCounts, prodCounts] = await Promise.all([
      this.ctx.db
        .prepare('SELECT * FROM suppliers WHERE active = 1 ORDER BY name ASC')
        .all<any>(),
      this.ctx.db
        .prepare('SELECT supplier_id, COUNT(*) AS cnt FROM product_supplier_options GROUP BY supplier_id')
        .all<{ supplier_id: number; cnt: number }>(),
      this.ctx.db
        .prepare('SELECT upper(trim(supplier_name)) AS sname, COUNT(*) AS cnt FROM products WHERE active = 1 AND supplier_name IS NOT NULL GROUP BY upper(trim(supplier_name))')
        .all<{ sname: string; cnt: number }>(),
    ]);

    const optMap = new Map<number, number>();
    for (const r of optCounts.results || []) {
      optMap.set(r.supplier_id, r.cnt);
    }
    const prodMap = new Map<string, number>();
    for (const r of prodCounts.results || []) {
      prodMap.set(r.sname, r.cnt);
    }

    return (rows.results || []).map((r) => {
      const byOpt = optMap.get(r.id) || 0;
      const byProd = prodMap.get(String(r.name || '').trim().toUpperCase()) || 0;
      return {
        id: r.id,
        name: r.name,
        cuit: r.cuit ?? null,
        phone: r.phone ?? null,
        email: r.email ?? null,
        contactPerson: r.contact_person ?? null,
        city: r.city ?? 'Buenos Aires',
        leadTimeDays: r.lead_time_days ?? 3,
        leadTimeAlertDays: r.lead_time_alert_days ?? 5,
        hasDelayAlert: (r.lead_time_days ?? 3) > (r.lead_time_alert_days ?? 5),
        freightPct: r.freight_pct ?? 5.5,
        paymentTerms: r.payment_terms ?? null,
        brandsSupplied: r.brands_supplied ?? null,
        notes: r.notes ?? null,
        productsCount: Math.max(byOpt, byProd),
        active: bool(r.active),
        createdAt: r.created_at,
      };
    });
  }

  /**
   * 2. Da de alta un proveedor nuevo.
   */
  async createSupplier(input: SupplierCreateInput): Promise<SupplierDetail> {
    const existing = await this.ctx.db
      .prepare('SELECT id FROM suppliers WHERE lower(trim(name)) = lower(trim(?))')
      .bind(input.name)
      .first<{ id: number }>();

    if (existing) {
      throw Errors.conflict('SUPPLIER_EXISTS', `El proveedor "${input.name}" ya está registrado.`);
    }

    const now = nowIso();
    const res = await this.ctx.db
      .prepare(
        `INSERT INTO suppliers (
          name, cuit, phone, email, contact_person, city,
          lead_time_days, lead_time_alert_days, freight_pct,
          payment_terms, brands_supplied, notes, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        input.name.trim(),
        input.cuit?.trim() || null,
        input.phone?.trim() || null,
        input.email?.trim() || null,
        input.contactPerson?.trim() || null,
        input.city?.trim() || 'Buenos Aires',
        input.leadTimeDays,
        input.leadTimeAlertDays,
        input.freightPct,
        input.paymentTerms?.trim() || 'Cuenta corriente 30 días',
        input.brandsSupplied?.trim() || null,
        input.notes?.trim() || null,
        now,
        now,
      )
      .run();

    const supplierId = res.meta.last_row_id;
    await auditStmt(this.ctx, 'supplier.create', 'suppliers', supplierId, input).run();

    const row = await this.ctx.db
      .prepare('SELECT * FROM suppliers WHERE id = ?')
      .bind(supplierId)
      .first<any>();

    return {
      id: row.id,
      name: row.name,
      cuit: row.cuit ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      contactPerson: row.contact_person ?? null,
      city: row.city ?? 'Buenos Aires',
      leadTimeDays: row.lead_time_days,
      leadTimeAlertDays: row.lead_time_alert_days,
      hasDelayAlert: row.lead_time_days > row.lead_time_alert_days,
      freightPct: row.freight_pct,
      paymentTerms: row.payment_terms ?? null,
      brandsSupplied: row.brands_supplied ?? null,
      notes: row.notes ?? null,
      productsCount: 0,
      active: bool(row.active),
      createdAt: row.created_at,
    };
  }

  /**
   * 2b. Actualiza datos de un proveedor existente.
   */
  async updateSupplier(id: number, input: SupplierUpdateInput): Promise<SupplierDetail> {
    const existing = await this.ctx.db
      .prepare('SELECT * FROM suppliers WHERE id = ?')
      .bind(id)
      .first<any>();

    if (!existing) throw Errors.notFound('El proveedor');

    const now = nowIso();
    const nextName = input.name?.trim() || existing.name;
    const nextCuit = input.cuit !== undefined ? input.cuit?.trim() || null : existing.cuit;
    const nextPhone = input.phone !== undefined ? input.phone?.trim() || null : existing.phone;
    const nextEmail = input.email !== undefined ? input.email?.trim() || null : existing.email;
    const nextContact =
      input.contactPerson !== undefined ? input.contactPerson?.trim() || null : existing.contact_person;
    const nextCity = input.city !== undefined ? input.city?.trim() || 'Buenos Aires' : existing.city;
    const nextLead = input.leadTimeDays ?? existing.lead_time_days;
    const nextAlert = input.leadTimeAlertDays ?? existing.lead_time_alert_days;
    const nextFreight = input.freightPct ?? existing.freight_pct;
    const nextTerms =
      input.paymentTerms !== undefined ? input.paymentTerms?.trim() || null : existing.payment_terms;
    const nextBrands =
      input.brandsSupplied !== undefined ? input.brandsSupplied?.trim() || null : existing.brands_supplied;
    const nextNotes = input.notes !== undefined ? input.notes?.trim() || null : existing.notes;

    await this.ctx.db
      .prepare(
        `UPDATE suppliers SET
           name = ?, cuit = ?, phone = ?, email = ?, contact_person = ?, city = ?,
           lead_time_days = ?, lead_time_alert_days = ?, freight_pct = ?,
           payment_terms = ?, brands_supplied = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        nextName,
        nextCuit,
        nextPhone,
        nextEmail,
        nextContact,
        nextCity,
        nextLead,
        nextAlert,
        nextFreight,
        nextTerms,
        nextBrands,
        nextNotes,
        now,
        id,
      )
      .run();

    await auditStmt(this.ctx, 'supplier.update', 'suppliers', id, input).run();

    return {
      id,
      name: nextName,
      cuit: nextCuit,
      phone: nextPhone,
      email: nextEmail,
      contactPerson: nextContact,
      city: nextCity,
      leadTimeDays: nextLead,
      leadTimeAlertDays: nextAlert,
      hasDelayAlert: nextLead > nextAlert,
      freightPct: nextFreight,
      paymentTerms: nextTerms,
      brandsSupplied: nextBrands,
      notes: nextNotes,
      active: bool(existing.active),
      createdAt: existing.created_at,
    };
  }

  /**
   * 3. Guarda o actualiza una opción de proveedor para un producto específico.
   */
  async upsertProductSupplierOption(input: ProductSupplierOptionInput): Promise<void> {
    const supplier = await this.ctx.db
      .prepare('SELECT id, name FROM suppliers WHERE id = ?')
      .bind(input.supplierId)
      .first<{ id: number; name: string }>();

    if (!supplier) throw Errors.notFound('El proveedor');

    const now = nowIso();
    await this.ctx.db
      .prepare(
        `INSERT INTO product_supplier_options (
          product_id, supplier_id, supplier_name, supplier_code, brand_offered,
          unit_cost_cents, freight_pct, lead_time_days, is_preferred, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(product_id, supplier_id) DO UPDATE SET
          supplier_name = excluded.supplier_name,
          supplier_code = COALESCE(excluded.supplier_code, product_supplier_options.supplier_code),
          brand_offered = COALESCE(excluded.brand_offered, product_supplier_options.brand_offered),
          unit_cost_cents = excluded.unit_cost_cents,
          freight_pct = excluded.freight_pct,
          lead_time_days = excluded.lead_time_days,
          is_preferred = excluded.is_preferred,
          updated_at = excluded.updated_at`,
      )
      .bind(
        input.productId,
        input.supplierId,
        supplier.name,
        input.supplierCode?.trim() || null,
        input.brandOffered?.trim() || null,
        input.unitCostCents,
        input.freightPct,
        input.leadTimeDays,
        input.isPreferred ? 1 : 0,
        now,
      )
      .run();
  }

  /**
   * Construye el mapa comparador real multi-proveedor para un conjunto de productos:
   * une `product_supplier_options` directos + equivalencias por código técnico en otros proveedores + proveedor habitual del artículo.
   */
  private async buildMultiSupplierMap(
    products: any[],
    suppliers: SupplierDetail[],
  ): Promise<Map<number, { options: SupplierOptionComparison[]; recommendedSupplierId: number | null; defaultSupplierName: string | null }>> {
    const resultMap = new Map<
      number,
      { options: SupplierOptionComparison[]; recommendedSupplierId: number | null; defaultSupplierName: string | null }
    >();
    if (products.length === 0) return resultMap;

    const supplierByNameUpper = new Map<string, SupplierDetail>();
    const supplierById = new Map<number, SupplierDetail>();
    for (const s of suppliers) {
      supplierByNameUpper.set(s.name.trim().toUpperCase(), s);
      supplierById.set(s.id, s);
    }

    const productIds = products.map((p) => Number(p.id)).filter((id) => id > 0);
    const directOptionsByProd = new Map<number, any[]>();

    // Chunked query over product_supplier_options
    for (let i = 0; i < productIds.length; i += 80) {
      const chunk = productIds.slice(i, i + 80);
      const idList = chunk.join(',');
      const optRes = await this.ctx.db
        .prepare(
          `SELECT pso.*, s.phone AS supplier_phone, s.lead_time_alert_days
           FROM product_supplier_options pso
           JOIN suppliers s ON s.id = pso.supplier_id
           WHERE s.active = 1 AND pso.product_id IN (${idList})
           ORDER BY pso.unit_cost_cents ASC`,
        )
        .all<any>();

      for (const r of optRes.results || []) {
        const arr = directOptionsByProd.get(r.product_id) || [];
        arr.push(r);
        directOptionsByProd.set(r.product_id, arr);
      }
    }

    // Para búsquedas puntuales (ej. <= 20 productos en buscador POS), cruzar también códigos equivalentes en otros proveedores
    const crossCodeOptions = new Map<string, any[]>();
    if (products.length <= 20) {
      const allTechCodes = new Set<string>();
      const prodTechCodes = new Map<number, string[]>();
      for (const p of products) {
        const codes = extractTechnicalSearchCodes(p.sku, p.name, p.supplier_code ?? null);
        prodTechCodes.set(p.id, codes);
        for (const c of codes) allTechCodes.add(c);
      }

      const codeArr = Array.from(allTechCodes).slice(0, 25);
      if (codeArr.length > 0) {
        const placeholders = codeArr.map(() => '?').join(',');
        const crossRes = await this.ctx.db
          .prepare(
            `SELECT pso.*, s.phone AS supplier_phone, s.lead_time_alert_days, upper(trim(pso.supplier_code)) AS norm_sc
             FROM product_supplier_options pso
             JOIN suppliers s ON s.id = pso.supplier_id
             WHERE s.active = 1 AND upper(trim(pso.supplier_code)) IN (${placeholders})
             ORDER BY pso.unit_cost_cents ASC
             LIMIT 100`,
          )
          .bind(...codeArr)
          .all<any>();

        for (const r of crossRes.results || []) {
          const key = r.norm_sc;
          const list = crossCodeOptions.get(key) || [];
          list.push(r);
          crossCodeOptions.set(key, list);
        }
      }

      for (const p of products) {
        const codes = prodTechCodes.get(p.id) || [];
        const existingList = directOptionsByProd.get(p.id) || [];
        const seenSupIds = new Set(existingList.map((x) => x.supplier_id));
        for (const c of codes) {
          for (const cr of crossCodeOptions.get(c) || []) {
            if (!seenSupIds.has(cr.supplier_id)) {
              seenSupIds.add(cr.supplier_id);
              existingList.push(cr);
            }
          }
        }
        if (existingList.length > 0) {
          directOptionsByProd.set(p.id, existingList);
        }
      }
    }

    const fallbackSupplier =
      suppliers.find((s) => s.name.toUpperCase().includes('ALFA')) ||
      suppliers.find((s) => !(s.brandsSupplied || '').toUpperCase().includes('TRANSPORTE')) ||
      suppliers[0] ||
      null;

    for (const p of products) {
      const rawOpts = directOptionsByProd.get(p.id) || [];
      const comparisons: SupplierOptionComparison[] = [];
      const seenSupplierIds = new Set<number>();

      // Si el producto tiene un proveedor titular en `products.supplier_name`, asegurar que esté presente
      const prodSupUpper = p.supplier_name ? String(p.supplier_name).trim().toUpperCase() : null;
      const titularSupplier = prodSupUpper ? supplierByNameUpper.get(prodSupUpper) || null : null;

      for (const o of rawOpts) {
        if (seenSupplierIds.has(o.supplier_id)) continue;
        seenSupplierIds.add(o.supplier_id);
        const unitCost = o.unit_cost_cents > 0 ? o.unit_cost_cents : p.cost_cents || Math.round((p.price_cents || 0) * 0.62);
        const fPct = o.freight_pct ?? 5.5;
        const landed = Math.round(unitCost * (1 + fPct / 100));
        const alertDays = o.lead_time_alert_days ?? 5;
        const isTitular = titularSupplier ? o.supplier_id === titularSupplier.id : o.is_preferred === 1;

        comparisons.push({
          optionId: o.id,
          supplierId: o.supplier_id,
          supplierName: o.supplier_name,
          supplierPhone: o.supplier_phone ?? null,
          supplierCode: o.supplier_code || p.supplier_code || p.sku,
          brandOffered: o.brand_offered || p.brand,
          unitCostCents: unitCost,
          freightPct: fPct,
          landedUnitCostCents: landed,
          leadTimeDays: o.lead_time_days ?? 3,
          leadTimeAlertDays: alertDays,
          hasDelayAlert: (o.lead_time_days ?? 3) > alertDays,
          isCheapest: false,
          isFastest: false,
          isPreferred: isTitular || o.is_preferred === 1,
        });
      }

      if (titularSupplier && !seenSupplierIds.has(titularSupplier.id)) {
        seenSupplierIds.add(titularSupplier.id);
        const unitCost = p.cost_cents || Math.round((p.price_cents || 0) * 0.62);
        const fPct = p.freight_pct || titularSupplier.freightPct;
        comparisons.unshift({
          optionId: -titularSupplier.id,
          supplierId: titularSupplier.id,
          supplierName: titularSupplier.name,
          supplierPhone: titularSupplier.phone,
          supplierCode: p.supplier_code || p.sku,
          brandOffered: p.brand || 'Estándar',
          unitCostCents: unitCost,
          freightPct: fPct,
          landedUnitCostCents: Math.round(unitCost * (1 + fPct / 100)),
          leadTimeDays: titularSupplier.leadTimeDays,
          leadTimeAlertDays: titularSupplier.leadTimeAlertDays,
          hasDelayAlert: titularSupplier.hasDelayAlert,
          isCheapest: false,
          isFastest: false,
          isPreferred: true,
        });
      }

      if (comparisons.length === 0 && fallbackSupplier) {
        const unitCost = p.cost_cents || Math.round((p.price_cents || 0) * 0.62);
        const fPct = fallbackSupplier.freightPct;
        comparisons.push({
          optionId: -1,
          supplierId: fallbackSupplier.id,
          supplierName: fallbackSupplier.name,
          supplierPhone: fallbackSupplier.phone,
          supplierCode: p.supplier_code || p.sku,
          brandOffered: p.brand || 'Estándar',
          unitCostCents: unitCost,
          freightPct: fPct,
          landedUnitCostCents: Math.round(unitCost * (1 + fPct / 100)),
          leadTimeDays: fallbackSupplier.leadTimeDays,
          leadTimeAlertDays: fallbackSupplier.leadTimeAlertDays,
          hasDelayAlert: fallbackSupplier.hasDelayAlert,
          isCheapest: true,
          isFastest: true,
          isPreferred: false,
        });
      }

      // Ordenar por costo puesto en Bariloche (primero los que tienen costo > 0)
      comparisons.sort((a, b) => {
        if (a.landedUnitCostCents > 0 && b.landedUnitCostCents === 0) return -1;
        if (a.landedUnitCostCents === 0 && b.landedUnitCostCents > 0) return 1;
        return a.landedUnitCostCents - b.landedUnitCostCents;
      });

      const priced = comparisons.filter((c) => c.landedUnitCostCents > 0);
      const poolForMin = priced.length > 0 ? priced : comparisons;
      if (poolForMin.length > 0) {
        const minLanded = Math.min(...poolForMin.map((c) => c.landedUnitCostCents));
        const minLead = Math.min(...comparisons.map((c) => c.leadTimeDays));
        for (const c of comparisons) {
          c.isCheapest = c.landedUnitCostCents > 0 && c.landedUnitCostCents === minLanded;
          c.isFastest = c.leadTimeDays === minLead;
        }
      }

      const withoutDelay = comparisons.filter((c) => !c.hasDelayAlert);
      const recommended =
        withoutDelay.find((c) => c.isPreferred) ||
        comparisons.find((c) => c.isPreferred) ||
        withoutDelay[0] ||
        comparisons[0] ||
        null;

      const defaultSupName =
        p.supplier_name ||
        recommended?.supplierName ||
        comparisons[0]?.supplierName ||
        null;

      resultMap.set(p.id, {
        options: comparisons,
        recommendedSupplierId: recommended ? recommended.supplierId : null,
        defaultSupplierName: defaultSupName,
      });
    }

    return resultMap;
  }

  /**
   * 3b. Buscador estilo Punto de Venta para Pedidos a Proveedores:
   *     Busca por código de barras, SKU, código de proveedor o texto libre sobre los 105.960 artículos,
   *     detecta automáticamente de qué proveedor es y devuelve la comparativa contra todos los proveedores que lo trabajan.
   */
  async lookupProductsForOrder(rawQuery: string): Promise<{
    exactMatch: boolean;
    items: ReplenishmentCandidateItem[];
  }> {
    const q = (rawQuery || '').trim();
    if (!q) return { exactMatch: false, items: [] };

    const suppliers = await this.listSuppliers();

    // Consultar qué productos ya tienen órdenes en camino ('ordered')
    const orderedRows = await this.ctx.db
      .prepare(
        `SELECT spoi.product_id, spoi.quantity, spo.order_number
         FROM supplier_purchase_order_items spoi
         JOIN supplier_purchase_orders spo ON spo.id = spoi.order_id
         WHERE spo.status = 'ordered' AND spoi.product_id IS NOT NULL`,
      )
      .all<{ product_id: number; quantity: number; order_number: string }>();

    const orderedByProd = new Map<number, { qty: number; orders: string[] }>();
    for (const r of orderedRows.results || []) {
      const entry = orderedByProd.get(r.product_id) || { qty: 0, orders: [] };
      entry.qty += r.quantity;
      if (!entry.orders.includes(r.order_number)) entry.orders.push(r.order_number);
      orderedByProd.set(r.product_id, entry);
    }

    // 1. Intento de coincidencia exacta por código de barras o SKU (comportamiento lector láser POS)
    let exactRows = await this.ctx.db
      .prepare(
        `SELECT p.id, p.sku, p.name, p.brand, p.location, p.dimensions, p.price_cents, p.cost_cents,
                p.stock, p.min_stock, p.target_stock, p.supplier_name, p.supplier_code, p.freight_pct,
                (SELECT pb.code FROM product_barcodes pb WHERE pb.product_id = p.id AND pb.active = 1 ORDER BY pb.is_primary DESC, pb.id ASC LIMIT 1) AS primary_barcode
         FROM products p
         WHERE p.active = 1
           AND (
             p.sku = ? COLLATE NOCASE
             OR EXISTS (
               SELECT 1 FROM product_barcodes pb
               WHERE pb.product_id = p.id AND pb.active = 1 AND pb.code = ? COLLATE NOCASE
             )
           )
         LIMIT 5`,
      )
      .bind(q, q)
      .all<any>();

    let isExact = (exactRows.results || []).length === 1;
    let foundRows: any[] = exactRows.results || [];

    // 2. Si no hubo match único por código de barras/SKU, buscar multi-palabra sin orden e ignorando comas/espacios/guiones
    if (!isExact) {
      const parsed = parseSmartSearchQuery(q, 7);

      const conds: string[] = ['p.active = 1'];
      const bindParams: any[] = [];
      for (const grp of parsed.groups) {
        const subOr: string[] = [];
        for (const variant of grp.variants) {
          const like = `%${variant}%`;
          subOr.push(
            'p.sku LIKE ?',
            'p.supplier_code LIKE ?',
            'p.name LIKE ?',
            'p.brand LIKE ?',
            'p.description LIKE ?',
            'p.dimensions LIKE ?',
            'EXISTS (SELECT 1 FROM product_barcodes pb WHERE pb.product_id = p.id AND pb.active = 1 AND pb.code LIKE ?)',
          );
          bindParams.push(like, like, like, like, like, like, like);
          if (grp.isCodeLike) {
            const cv = variant.replace(/[^a-z0-9]/gi, '');
            if (cv.length >= 3) {
              subOr.push("REPLACE(REPLACE(REPLACE(p.name, ' ', ''), '-', ''), '/', '') LIKE ?");
              bindParams.push(`%${cv}%`);
            }
          }
        }
        if (subOr.length > 0) {
          conds.push(`(${subOr.join(' OR ')})`);
        }
      }

      const searchRes = await this.ctx.db
        .prepare(
          `SELECT p.id, p.sku, p.name, p.brand, p.location, p.dimensions, p.price_cents, p.cost_cents,
                  p.stock, p.min_stock, p.target_stock, p.supplier_name, p.supplier_code, p.freight_pct,
                  (SELECT pb.code FROM product_barcodes pb WHERE pb.product_id = p.id AND pb.active = 1 ORDER BY pb.is_primary DESC, pb.id ASC LIMIT 1) AS primary_barcode
           FROM products p
           WHERE ${conds.join(' AND ')}
           ORDER BY
             CASE
               WHEN p.sku = ? COLLATE NOCASE THEN 0
               WHEN p.supplier_code = ? COLLATE NOCASE THEN 1
               WHEN p.name LIKE ? THEN 2
               ELSE 3
             END,
             p.stock DESC,
             p.price_cents DESC,
             p.id ASC
           LIMIT 15`,
        )
        .bind(...bindParams, q, q, `${q}%`)
        .all<any>();

      const seenIds = new Set(foundRows.map((r) => r.id));
      for (const r of searchRes.results || []) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          foundRows.push(r);
        }
      }
      foundRows = foundRows.slice(0, 15);
      if (foundRows.length === 1 && (
        String(foundRows[0].supplier_code || '').toUpperCase() === q.toUpperCase() ||
        String(foundRows[0].sku || '').toUpperCase() === q.toUpperCase()
      )) {
        isExact = true;
      }
    }

    const multiMap = await this.buildMultiSupplierMap(foundRows, suppliers);

    const items: ReplenishmentCandidateItem[] = foundRows.map((p) => {
      const supData = multiMap.get(p.id) || {
        options: [],
        recommendedSupplierId: null,
        defaultSupplierName: p.supplier_name ?? null,
      };
      const ordInfo = orderedByProd.get(p.id) || { qty: 0, orders: [] };
      const target = p.target_stock ?? (p.min_stock ? p.min_stock * 2 : 1);
      const suggested = Math.max(1, target - p.stock);

      return {
        key: `prod_${p.id}`,
        productId: p.id,
        depositId: null,
        sku: p.sku,
        primaryBarcode: p.primary_barcode ?? null,
        defaultSupplierName: supData.defaultSupplierName,
        name: p.name,
        brand: p.brand ?? null,
        location: p.location ?? null,
        dimensions: p.dimensions ?? null,
        currentStock: p.stock,
        minStock: p.min_stock ?? null,
        targetStock: p.target_stock ?? null,
        soldTodayQty: 0,
        customerDepositQty: 0,
        depositCustomerName: null,
        depositNumber: null,
        alreadyOrderedQty: ordInfo.qty,
        pendingOrderNumbers: ordInfo.orders,
        suggestedOrderQty: suggested,
        originReasons: ['manual'],
        isAlreadyCoveredByOrder: ordInfo.qty > 0,
        supplierOptions: supData.options,
        recommendedSupplierId: supData.recommendedSupplierId,
      };
    });

    return { exactMatch: isExact, items };
  }

  /**
   * 4. Bandeja Inteligente de Reposición y Pedidos a Proveedores
   */
  async getReplenishmentBoard(params: { date?: string; includeAlreadyCovered?: boolean } = {}): Promise<{
    date: string;
    currentUserName: string;
    staffUsers: string[];
    summary: {
      totalToOrderCount: number;
      soldTodayItemsCount: number;
      lowStockItemsCount: number;
      customerDepositsCount: number;
      alreadyOrderedCount: number;
    };
    suppliers: SupplierDetail[];
    candidates: ReplenishmentCandidateItem[];
  }> {
    const targetDate = params.date || new Date().toISOString().slice(0, 10);
    const [suppliers, usersRes] = await Promise.all([
      this.listSuppliers(),
      this.ctx.db
        .prepare('SELECT display_name FROM users WHERE active = 1 ORDER BY id ASC')
        .all<{ display_name: string }>(),
    ]);

    const staffUsers = Array.from(
      new Set([
        this.ctx.user.displayName,
        ...(usersRes.results || []).map((u) => u.display_name).filter(Boolean),
      ]),
    );

    // 1. Consultar lo vendido en la fecha seleccionada
    const soldRows = await this.ctx.db
      .prepare(
        `SELECT si.product_id, SUM(si.quantity - si.returned_qty) AS sold_qty
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.status IN ('completed', 'partially_returned')
           AND s.created_at >= ? AND s.created_at <= ?
         GROUP BY si.product_id
         HAVING sold_qty > 0`,
      )
      .bind(`${targetDate}T00:00:00.000Z`, `${targetDate}T23:59:59.999Z`)
      .all<{ product_id: number; sold_qty: number }>();

    const soldTodayMap = new Map<number, number>();
    for (const r of soldRows.results || []) {
      soldTodayMap.set(r.product_id, r.sold_qty);
    }

    // 2. Consultar lo que YA FUE PEDIDO y está en tránsito ('ordered')
    const orderedRows = await this.ctx.db
      .prepare(
        `SELECT spoi.product_id, spoi.deposit_id, spoi.quantity, spo.order_number
         FROM supplier_purchase_order_items spoi
         JOIN supplier_purchase_orders spo ON spo.id = spoi.order_id
         WHERE spo.status = 'ordered'`,
      )
      .all<{ product_id: number | null; deposit_id: number | null; quantity: number; order_number: string }>();

    const alreadyOrderedByProduct = new Map<number, { qty: number; orders: string[] }>();
    const alreadyOrderedByDeposit = new Map<number, { qty: number; orders: string[] }>();

    for (const r of orderedRows.results || []) {
      if (r.product_id) {
        const entry = alreadyOrderedByProduct.get(r.product_id) || { qty: 0, orders: [] };
        entry.qty += r.quantity;
        if (!entry.orders.includes(r.order_number)) entry.orders.push(r.order_number);
        alreadyOrderedByProduct.set(r.product_id, entry);
      }
      if (r.deposit_id) {
        const entry = alreadyOrderedByDeposit.get(r.deposit_id) || { qty: 0, orders: [] };
        entry.qty += r.quantity;
        if (!entry.orders.includes(r.order_number)) entry.orders.push(r.order_number);
        alreadyOrderedByDeposit.set(r.deposit_id, entry);
      }
    }

    // 3. Consultar productos que se vendieron hoy O tienen faltante real de stock
    const soldIds = Array.from(soldTodayMap.keys());
    const soldInClause =
      soldIds.length > 0 ? `OR id IN (${soldIds.map((id) => Number(id)).join(',')})` : '';

    const allProductsRows = await this.ctx.db
      .prepare(
        `SELECT id, sku, name, brand, location, dimensions, price_cents, cost_cents,
                stock, min_stock, target_stock, supplier_name, supplier_code, freight_pct, last_movement_at
         FROM products
         WHERE active = 1
           AND (
             (stock = 0 AND (min_stock IS NOT NULL OR last_movement_at IS NOT NULL))
             OR (min_stock IS NOT NULL AND stock <= min_stock)
             ${soldInClause}
           )
         ORDER BY stock ASC, id ASC
         LIMIT 150`,
      )
      .all<any>();

    const candidateProducts = allProductsRows.results || [];
    const multiSupplierMap = await this.buildMultiSupplierMap(candidateProducts, suppliers);

    // 4. Consultar señas de clientes pendientes de pedir
    const depositRows = await this.ctx.db
      .prepare(
        `SELECT * FROM customer_deposits
         WHERE status IN ('pending_order', 'ordered_to_supplier')
         ORDER BY created_at DESC`,
      )
      .all<any>();

    const candidates: ReplenishmentCandidateItem[] = [];
    let soldTodayItemsCount = 0;
    let lowStockItemsCount = 0;
    let customerDepositsCount = 0;
    let alreadyOrderedCount = 0;

    // A) Procesar productos sugeridos
    for (const p of candidateProducts) {
      const soldTodayQty = soldTodayMap.get(p.id) || 0;
      const isLowStock = p.stock === 0 || (p.min_stock !== null && p.stock <= p.min_stock);

      if (soldTodayQty === 0 && !isLowStock) continue;

      const originReasons: ReplenishmentOriginReason[] = [];
      if (soldTodayQty > 0) {
        originReasons.push('sold_today');
        soldTodayItemsCount += 1;
      }
      if (isLowStock) {
        originReasons.push('low_stock');
        lowStockItemsCount += 1;
      }

      const orderedInfo = alreadyOrderedByProduct.get(p.id) || { qty: 0, orders: [] };
      const target = p.target_stock ?? (p.min_stock ? p.min_stock * 2 : Math.max(2, p.stock + soldTodayQty));
      const rawNeeded = Math.max(soldTodayQty, target - p.stock, 1);
      const netSuggested = Math.max(0, rawNeeded - orderedInfo.qty);
      const isAlreadyCovered = orderedInfo.qty >= rawNeeded;

      if (isAlreadyCovered) {
        alreadyOrderedCount += 1;
        if (!params.includeAlreadyCovered) continue;
      }

      const supInfo = multiSupplierMap.get(p.id) || {
        options: [],
        recommendedSupplierId: null,
        defaultSupplierName: p.supplier_name ?? null,
      };

      candidates.push({
        key: `prod_${p.id}`,
        productId: p.id,
        depositId: null,
        sku: p.sku,
        defaultSupplierName: supInfo.defaultSupplierName,
        name: p.name,
        brand: p.brand ?? null,
        location: p.location ?? null,
        dimensions: p.dimensions ?? null,
        currentStock: p.stock,
        minStock: p.min_stock ?? null,
        targetStock: p.target_stock ?? null,
        soldTodayQty,
        customerDepositQty: 0,
        depositCustomerName: null,
        depositNumber: null,
        alreadyOrderedQty: orderedInfo.qty,
        pendingOrderNumbers: orderedInfo.orders,
        suggestedOrderQty: netSuggested > 0 ? netSuggested : rawNeeded,
        originReasons,
        isAlreadyCoveredByOrder: isAlreadyCovered,
        supplierOptions: supInfo.options,
        recommendedSupplierId: supInfo.recommendedSupplierId,
      });
    }

    // B) Procesar Señas de Clientes
    const defaultSup = suppliers.find((s) => s.name.toUpperCase().includes('ALFA')) || suppliers[0] || null;
    for (const dep of depositRows.results || []) {
      const orderedInfo = alreadyOrderedByDeposit.get(dep.id) || { qty: 0, orders: [] };
      const isAlreadyCovered =
        dep.status === 'ordered_to_supplier' || orderedInfo.qty >= dep.quantity;

      if (isAlreadyCovered) {
        alreadyOrderedCount += 1;
        if (!params.includeAlreadyCovered) continue;
      } else {
        customerDepositsCount += 1;
      }

      const sku = dep.product_sku || `ENC-${dep.id}`;
      const baseCost = Math.round((dep.estimated_unit_price_cents || dep.deposit_amount_cents) * 0.6);
      let depOptions: SupplierOptionComparison[] = [];
      let recSupId: number | null = null;
      let defSupName: string | null = dep.supplier_name ?? null;

      if (dep.product_id) {
        const prodRow = await this.ctx.db
          .prepare('SELECT id, sku, name, brand, price_cents, cost_cents, supplier_name, supplier_code, freight_pct FROM products WHERE id = ?')
          .bind(dep.product_id)
          .first<any>();
        if (prodRow) {
          const mm = await this.buildMultiSupplierMap([prodRow], suppliers);
          const got = mm.get(prodRow.id);
          if (got) {
            depOptions = got.options;
            recSupId = got.recommendedSupplierId;
            defSupName = got.defaultSupplierName;
          }
        }
      }

      if (depOptions.length === 0 && defaultSup) {
        depOptions = [
          {
            optionId: -1,
            supplierId: defaultSup.id,
            supplierName: defaultSup.name,
            supplierPhone: defaultSup.phone,
            supplierCode: sku,
            brandOffered: dep.brand ?? 'Estándar',
            unitCostCents: baseCost,
            freightPct: defaultSup.freightPct,
            landedUnitCostCents: Math.round(baseCost * (1 + defaultSup.freightPct / 100)),
            leadTimeDays: defaultSup.leadTimeDays,
            leadTimeAlertDays: defaultSup.leadTimeAlertDays,
            hasDelayAlert: defaultSup.hasDelayAlert,
            isCheapest: true,
            isFastest: true,
            isPreferred: true,
          },
        ];
        recSupId = defaultSup.id;
        defSupName = defSupName || defaultSup.name;
      }

      candidates.push({
        key: `dep_${dep.id}`,
        productId: dep.product_id ?? null,
        depositId: dep.id,
        sku,
        defaultSupplierName: defSupName,
        name: dep.product_description,
        brand: dep.brand ?? null,
        location: 'ENCARGO CON SEÑA',
        dimensions: null,
        currentStock: 0,
        minStock: null,
        targetStock: null,
        soldTodayQty: 0,
        customerDepositQty: dep.quantity,
        depositCustomerName: dep.customer_name,
        depositNumber: dep.deposit_number,
        alreadyOrderedQty: orderedInfo.qty,
        pendingOrderNumbers: orderedInfo.orders,
        suggestedOrderQty: Math.max(1, dep.quantity - orderedInfo.qty),
        originReasons: ['customer_deposit'],
        isAlreadyCoveredByOrder: isAlreadyCovered,
        supplierOptions: depOptions,
        recommendedSupplierId: recSupId,
      });
    }

    return {
      date: targetDate,
      currentUserName: this.ctx.user.displayName,
      staffUsers,
      summary: {
        totalToOrderCount: candidates.filter((c) => !c.isAlreadyCoveredByOrder).length,
        soldTodayItemsCount,
        lowStockItemsCount,
        customerDepositsCount,
        alreadyOrderedCount,
      },
      suppliers,
      candidates,
    };
  }

  /**
   * 5. Crea una Orden de Pedido a Proveedor registrando quién realizó el pedido (`ordered_by_name`).
   */
  async createPurchaseOrder(input: PurchaseOrderCreateInput): Promise<PurchaseOrderDetail> {
    const now = nowIso();
    const orderNumber = await this.getNextOrderNumber();
    const orderedByName = input.orderedByName?.trim() || this.ctx.user.displayName;

    let subtotalCents = 0;
    let totalLandedCents = 0;

    for (const it of input.items) {
      const fPct = it.freightPct ?? input.freightPct ?? 0;
      const landedUnit = Math.round(it.unitCostCents * (1 + fPct / 100));
      subtotalCents += it.unitCostCents * it.quantity;
      totalLandedCents += landedUnit * it.quantity;
    }

    const freightCents = Math.max(0, totalLandedCents - subtotalCents);
    const arrivalDate = new Date(Date.now() + (input.leadTimeDays || 3) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const res = await this.ctx.db
      .prepare(
        `INSERT INTO supplier_purchase_orders (
          order_number, supplier_id, supplier_name, supplier_phone,
          status, lead_time_days, expected_arrival_date,
          subtotal_cents, freight_pct, freight_cents, total_cents,
          items_count, notes, user_id, ordered_by_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'ordered', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        orderNumber,
        input.supplierId ?? null,
        input.supplierName.trim(),
        input.supplierPhone?.trim() || null,
        input.leadTimeDays || 3,
        arrivalDate,
        subtotalCents,
        input.freightPct || 0,
        freightCents,
        totalLandedCents,
        input.items.length,
        input.notes?.trim() || null,
        this.ctx.user.id,
        orderedByName,
        now,
        now,
      )
      .run();

    const orderId = res.meta.last_row_id;
    const stmts: D1PreparedStatement[] = [];

    for (const it of input.items) {
      const fPct = it.freightPct ?? input.freightPct ?? 0;
      const landedUnit = Math.round(it.unitCostCents * (1 + fPct / 100));
      const lineTotal = landedUnit * it.quantity;

      stmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO supplier_purchase_order_items (
              order_id, product_id, deposit_id, sku, name, brand, supplier_code,
              origin_reason, quantity, unit_cost_cents, freight_pct, landed_unit_cost_cents, line_total_cents
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            orderId,
            it.productId ?? null,
            it.depositId ?? null,
            it.sku.trim(),
            it.name.trim(),
            it.brand?.trim() || null,
            it.supplierCode?.trim() || null,
            it.originReason,
            it.quantity,
            it.unitCostCents,
            fPct,
            landedUnit,
            lineTotal,
          ),
      );

      if (it.depositId) {
        stmts.push(
          this.ctx.db
            .prepare(
              `UPDATE customer_deposits
               SET status = 'ordered_to_supplier', supplier_name = ?, estimated_arrival_date = ?, updated_at = ?
               WHERE id = ?`,
            )
            .bind(input.supplierName.trim(), arrivalDate, now, it.depositId),
        );
      }
    }

    stmts.push(
      auditStmt(this.ctx, 'replenishment.order_create', 'supplier_purchase_orders', orderId, {
        orderNumber,
        supplierName: input.supplierName,
        orderedByName,
        totalCents: totalLandedCents,
        itemsCount: input.items.length,
      }),
    );

    await this.ctx.db.batch(stmts);
    return (await this.getPurchaseOrderById(orderId))!;
  }

  async getPurchaseOrderById(id: number): Promise<PurchaseOrderDetail | null> {
    const r = await this.ctx.db
      .prepare(
        `SELECT o.*,
                u.display_name AS user_name,
                ru.display_name AS received_user_display_name
         FROM supplier_purchase_orders o
         JOIN users u ON u.id = o.user_id
         LEFT JOIN users ru ON ru.id = o.received_by_user_id
         WHERE o.id = ?`,
      )
      .bind(id)
      .first<any>();

    if (!r) return null;

    const itemRows = await this.ctx.db
      .prepare('SELECT * FROM supplier_purchase_order_items WHERE order_id = ? ORDER BY id ASC')
      .bind(id)
      .all<any>();

    return {
      id: r.id,
      orderNumber: r.order_number,
      supplierId: r.supplier_id ?? null,
      supplierName: r.supplier_name,
      supplierPhone: r.supplier_phone ?? null,
      status: r.status,
      leadTimeDays: r.lead_time_days,
      expectedArrivalDate: r.expected_arrival_date ?? null,
      hasDelayAlert: (r.lead_time_days || 3) > 5,
      subtotalCents: r.subtotal_cents,
      freightPct: r.freight_pct,
      freightCents: r.freight_cents,
      totalCents: r.total_cents,
      itemsCount: r.items_count,
      notes: r.notes ?? null,
      userId: r.user_id,
      userName: r.user_name || 'Encargado de Salón',
      orderedByName: r.ordered_by_name || r.user_name || 'Encargado de Salón',
      receivedByUserId: r.received_by_user_id ?? null,
      receivedByName: r.received_by_name || r.received_user_display_name || null,
      receivedAt: r.received_at ?? null,
      receptionNotes: r.reception_notes ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      items: (itemRows.results || []).map((it) => ({
        id: it.id,
        orderId: it.order_id,
        productId: it.product_id ?? null,
        depositId: it.deposit_id ?? null,
        sku: it.sku,
        name: it.name,
        brand: it.brand ?? null,
        supplierCode: it.supplier_code ?? null,
        originReason: it.origin_reason,
        quantity: it.quantity,
        unitCostCents: it.unit_cost_cents,
        freightPct: it.freight_pct,
        landedUnitCostCents: it.landed_unit_cost_cents,
        lineTotalCents: it.line_total_cents,
      })),
    };
  }

  async listPurchaseOrders(): Promise<PurchaseOrderDetail[]> {
    const rows = await this.ctx.db
      .prepare(
        `SELECT o.id FROM supplier_purchase_orders o
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT 80`,
      )
      .all<{ id: number }>();

    const list: PurchaseOrderDetail[] = [];
    for (const r of rows.results || []) {
      const detail = await this.getPurchaseOrderById(r.id);
      if (detail) list.push(detail);
    }
    return list;
  }

  /**
   * 6. Cambia el estado de una Orden de Pedido.
   *    Cuando pasa a 'received' (Llegó al local), registra quién confirma la llegada,
   *    suma automáticamente el stock en `products` y genera los movimientos en Kardex (`stock_movements`).
   */
  async updatePurchaseOrderStatus(
    id: number,
    input: PurchaseOrderStatusUpdateInput,
  ): Promise<PurchaseOrderDetail> {
    const existing = await this.getPurchaseOrderById(id);
    if (!existing) throw Errors.notFound(`El pedido #${id}`);

    const status = input.status;
    if (existing.status === 'received' && status === 'received') {
      return existing;
    }

    const now = nowIso();
    const stmts: D1PreparedStatement[] = [];

    if (status === 'received' && existing.status !== 'received') {
      const confirmedBy = (input.receivedByName || '').trim() || this.ctx.user.displayName;
      const receptionNotes = input.receptionNotes?.trim() || null;

      stmts.push(
        this.ctx.db
          .prepare(
            `UPDATE supplier_purchase_orders
             SET status = 'received',
                 received_by_user_id = ?,
                 received_by_name = ?,
                 received_at = ?,
                 reception_notes = ?,
                 updated_at = ?
             WHERE id = ?`,
          )
          .bind(this.ctx.user.id, confirmedBy, now, receptionNotes, now, id),
      );

      for (const it of existing.items) {
        if (it.productId) {
          const prod = await this.ctx.db
            .prepare('SELECT stock, cost_cents FROM products WHERE id = ?')
            .bind(it.productId)
            .first<{ stock: number; cost_cents: number | null }>();

          if (prod) {
            const stockBefore = prod.stock;
            const stockAfter = stockBefore + it.quantity;
            const nextCost = it.unitCostCents > 0 ? it.unitCostCents : prod.cost_cents ?? 0;

            stmts.push(
              this.ctx.db
                .prepare(
                  `UPDATE products
                   SET stock = stock + ?, cost_cents = ?, freight_pct = ?, last_purchase_at = ?, last_movement_at = ?, updated_at = ?
                   WHERE id = ?`,
                )
                .bind(it.quantity, nextCost, it.freightPct, now, now, now, it.productId),
            );

            stmts.push(
              this.ctx.db
                .prepare(
                  `INSERT INTO stock_movements (
                    product_id, type, quantity, stock_before, stock_after, user_id, reason, ref_type, created_at
                  ) VALUES (?, 'purchase', ?, ?, ?, ?, ?, 'manual', ?)`,
                )
                .bind(
                  it.productId,
                  it.quantity,
                  stockBefore,
                  stockAfter,
                  this.ctx.user.id,
                  `Llegada Pedido ${existing.orderNumber} (${existing.supplierName}) · Confirmó: ${confirmedBy}`,
                  now,
                ),
            );
          }
        }

        if (it.depositId) {
          stmts.push(
            this.ctx.db
              .prepare("UPDATE customer_deposits SET status = 'arrived_in_store', updated_at = ? WHERE id = ?")
              .bind(now, it.depositId),
          );
        }
      }

      stmts.push(
        auditStmt(this.ctx, 'replenishment.order_receive', 'supplier_purchase_orders', id, {
          orderNumber: existing.orderNumber,
          receivedByName: confirmedBy,
          receptionNotes,
        }),
      );
    } else {
      stmts.push(
        this.ctx.db
          .prepare('UPDATE supplier_purchase_orders SET status = ?, updated_at = ? WHERE id = ?')
          .bind(status, now, id),
      );
      stmts.push(
        auditStmt(this.ctx, 'replenishment.order_status', 'supplier_purchase_orders', id, {
          orderNumber: existing.orderNumber,
          status,
        }),
      );
    }

    await this.ctx.db.batch(stmts);
    return (await this.getPurchaseOrderById(id))!;
  }
}
