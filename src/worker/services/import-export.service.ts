import type { ServiceContext } from '../env';
import { parseMoneyToCents } from '../../shared/money';
import { normalizeCode, isValidCode } from '../../shared/barcode';
import { auditStmt, nowIso } from '../lib/db';
import { Errors } from '../lib/errors';

export interface ImportRowIssue {
  rowNumber: number;
  sku?: string;
  field: string;
  message: string;
}

export interface ImportPreviewResult {
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  existingSkuCount: number;
  existingBarcodeCount: number;
  issues: ImportRowIssue[];
  previewSample: {
    rowNumber: number;
    sku: string;
    name: string;
    barcode?: string;
    price: string;
    stock: number;
    status: 'new' | 'existing_sku' | 'invalid';
  }[];
}

export class ImportExportService {
  constructor(private ctx: ServiceContext) {}

  /**
   * Valida fila por fila el archivo de importación y detecta duplicados en el archivo y en la base.
   */
  async previewImport(rows: Record<string, any>[]): Promise<ImportPreviewResult> {
    const issues: ImportRowIssue[] = [];
    const seenSkusInFile = new Set<string>();
    const seenBarcodesInFile = new Set<string>();

    const skusToCheck: string[] = [];
    const barcodesToCheck: string[] = [];

    // 1. Análisis sintáctico de cada fila
    const parsedRows = rows.map((r, idx) => {
      const rowNumber = idx + 2; // Considerando cabecera en fila 1
      const rawSku = String(r.sku || r.SKU || r.codigo_interno || '').trim();
      const rawName = String(r.nombre || r.name || r.descripcion_corta || '').trim();
      const rawBarcode = r.codigo_barras || r.barcode || r.codigo || null;
      const barcode = rawBarcode ? normalizeCode(String(rawBarcode)) : null;

      let valid = true;

      if (!rawSku) {
        issues.push({ rowNumber, field: 'sku', message: 'El SKU es obligatorio.' });
        valid = false;
      } else if (!isValidCode(rawSku)) {
        issues.push({ rowNumber, sku: rawSku, field: 'sku', message: 'El SKU contiene caracteres inválidos.' });
        valid = false;
      } else {
        const skuLower = rawSku.toLowerCase();
        if (seenSkusInFile.has(skuLower)) {
          issues.push({ rowNumber, sku: rawSku, field: 'sku', message: `SKU repetido dentro del archivo: "${rawSku}".` });
          valid = false;
        } else {
          seenSkusInFile.add(skuLower);
          skusToCheck.push(rawSku);
        }
      }

      if (!rawName) {
        issues.push({ rowNumber, sku: rawSku, field: 'nombre', message: 'El nombre es obligatorio.' });
        valid = false;
      }

      if (barcode) {
        if (!isValidCode(barcode)) {
          issues.push({ rowNumber, sku: rawSku, field: 'codigo_barras', message: 'Código de barras inválido.' });
          valid = false;
        } else if (seenBarcodesInFile.has(barcode)) {
          issues.push({
            rowNumber,
            sku: rawSku,
            field: 'codigo_barras',
            message: `Código de barras repetido dentro del archivo: "${barcode}".`,
          });
          valid = false;
        } else {
          seenBarcodesInFile.add(barcode);
          barcodesToCheck.push(barcode);
        }
      }

      const priceRaw = r.precio_venta ?? r.precio ?? r.price;
      const priceCents = parseMoneyToCents(priceRaw);
      if (priceCents === null || priceCents < 0) {
        issues.push({
          rowNumber,
          sku: rawSku,
          field: 'precio_venta',
          message: 'El precio de venta es obligatorio y debe ser un importe válido en pesos.',
        });
        valid = false;
      }

      const costRaw = r.costo ?? r.cost;
      const costCents = costRaw !== undefined && costRaw !== null && String(costRaw).trim() !== '' ? parseMoneyToCents(costRaw) : null;
      if (costRaw && costCents === null) {
        issues.push({ rowNumber, sku: rawSku, field: 'costo', message: 'El costo contiene un formato numérico inválido.' });
        valid = false;
      }

      const stockRaw = r.stock_inicial ?? r.stock ?? 0;
      const stock = Number(stockRaw);
      if (isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
        issues.push({ rowNumber, sku: rawSku, field: 'stock_inicial', message: 'El stock inicial debe ser un entero >= 0.' });
        valid = false;
      }

      const minStockRaw = r.stock_minimo ?? r.min_stock;
      const minStock = minStockRaw !== undefined && minStockRaw !== null && String(minStockRaw).trim() !== '' ? Number(minStockRaw) : null;
      if (minStockRaw && (isNaN(minStock!) || minStock! < 0 || !Number.isInteger(minStock!))) {
        issues.push({ rowNumber, sku: rawSku, field: 'stock_minimo', message: 'El stock mínimo debe ser un entero >= 0.' });
        valid = false;
      }

      const targetStockRaw = r.stock_objetivo ?? r.target_stock;
      const targetStock = targetStockRaw !== undefined && targetStockRaw !== null && String(targetStockRaw).trim() !== '' ? Number(targetStockRaw) : null;

      return {
        rowNumber,
        sku: rawSku,
        name: rawName,
        barcode,
        brand: r.marca ? String(r.marca).trim() : null,
        category: r.categoria ? String(r.categoria).trim() : null,
        description: r.descripcion ? String(r.descripcion).trim() : null,
        unit: r.unidad ? String(r.unidad).trim() : 'unidad',
        priceCents: priceCents ?? 0,
        costCents,
        stock,
        minStock,
        targetStock,
        valid,
      };
    });

    // 2. Comprobar existencia en base de datos para SKU y códigos de barra
    const existingSkusInDb = new Set<string>();
    if (skusToCheck.length > 0) {
      // Chunk de a 50 para límites de parámetros
      for (let i = 0; i < skusToCheck.length; i += 50) {
        const chunk = skusToCheck.slice(i, i + 50);
        const placeholders = chunk.map(() => '?').join(',');
        const rowsInDb = await this.ctx.db
          .prepare(`SELECT sku FROM products WHERE sku IN (${placeholders}) COLLATE NOCASE`)
          .bind(...chunk)
          .all<{ sku: string }>();
        rowsInDb.results.forEach((r) => existingSkusInDb.add(r.sku.toLowerCase()));
      }
    }

    const existingBarcodesInDb = new Set<string>();
    if (barcodesToCheck.length > 0) {
      for (let i = 0; i < barcodesToCheck.length; i += 50) {
        const chunk = barcodesToCheck.slice(i, i + 50);
        const placeholders = chunk.map(() => '?').join(',');
        const bRows = await this.ctx.db
          .prepare(`SELECT code FROM product_barcodes WHERE active = 1 AND code IN (${placeholders})`)
          .bind(...chunk)
          .all<{ code: string }>();
        bRows.results.forEach((r) => existingBarcodesInDb.add(r.code));
      }
    }

    let existingSkuCount = 0;
    let existingBarcodeCount = 0;

    const previewSample = parsedRows.slice(0, 10).map((r) => {
      const isExistingSku = existingSkusInDb.has(r.sku.toLowerCase());
      if (isExistingSku) existingSkuCount++;
      if (r.barcode && existingBarcodesInDb.has(r.barcode)) existingBarcodeCount++;

      let status: 'new' | 'existing_sku' | 'invalid' = 'new';
      if (!r.valid) status = 'invalid';
      else if (isExistingSku) status = 'existing_sku';

      return {
        rowNumber: r.rowNumber,
        sku: r.sku,
        name: r.name,
        barcode: r.barcode || undefined,
        price: `$ ${(r.priceCents / 100).toFixed(2)}`,
        stock: r.stock,
        status,
      };
    });

    // Contar totales en toda la lista
    let validCount = 0;
    let invalidCount = 0;
    parsedRows.forEach((r) => {
      if (r.valid) validCount++;
      else invalidCount++;
    });

    return {
      totalRows: rows.length,
      validRowsCount: validCount,
      invalidRowsCount: invalidCount,
      existingSkuCount,
      existingBarcodeCount,
      issues: issues.slice(0, 100), // Primeras 100 alertas
      previewSample,
    };
  }

  /**
   * Aplica la importación a la base de datos de manera controlada y por lotes.
   */
  async commitImport(params: {
    rows: Record<string, any>[];
    updateExisting: boolean;
    skipInvalid: boolean;
  }): Promise<{ imported: number; updated: number; skipped: number }> {
    const preview = await this.previewImport(params.rows);
    if (preview.invalidRowsCount > 0 && !params.skipInvalid) {
      throw Errors.badRequest(
        `El archivo contiene ${preview.invalidRowsCount} fila(s) con errores. Corregilas o activá "Omitir filas inválidas".`,
      );
    }

    const now = nowIso();
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const r of params.rows) {
      const rawSku = String(r.sku || r.SKU || r.codigo_interno || '').trim();
      const rawName = String(r.nombre || r.name || r.descripcion_corta || '').trim();
      const rawBarcode = r.codigo_barras || r.barcode || r.codigo || null;
      const barcode = rawBarcode ? normalizeCode(String(rawBarcode)) : null;

      const priceCents = parseMoneyToCents(r.precio_venta ?? r.precio ?? r.price);
      if (!rawSku || !rawName || priceCents === null || priceCents < 0) {
        skipped++;
        continue;
      }

      const costCents = parseMoneyToCents(r.costo ?? r.cost);
      const stock = Math.max(0, Math.floor(Number(r.stock_inicial ?? r.stock ?? 0)));
      const minStock = r.stock_minimo !== undefined && r.stock_minimo !== null && r.stock_minimo !== '' ? Math.max(0, Math.floor(Number(r.stock_minimo))) : null;
      const targetStock = r.stock_objetivo !== undefined && r.stock_objetivo !== null && r.stock_objetivo !== '' ? Math.max(0, Math.floor(Number(r.stock_objetivo))) : null;
      const unit = r.unidad ? String(r.unidad).trim() : 'unidad';
      const brand = r.marca ? String(r.marca).trim() : null;
      const categoryName = r.categoria ? String(r.categoria).trim() : null;
      const description = r.descripcion ? String(r.descripcion).trim() : null;

      // Resolver categoría
      let categoryId: number | null = null;
      if (categoryName) {
        const cat = await this.ctx.db
          .prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE')
          .bind(categoryName)
          .first<{ id: number }>();
        if (cat) categoryId = cat.id;
        else {
          const res = await this.ctx.db.prepare('INSERT INTO categories (name, active) VALUES (?, 1)').bind(categoryName).run();
          categoryId = res.meta.last_row_id;
        }
      }

      // Comprobar si existe el SKU
      const existing = await this.ctx.db
        .prepare('SELECT id, stock FROM products WHERE sku = ? COLLATE NOCASE')
        .bind(rawSku)
        .first<{ id: number; stock: number }>();

      if (existing) {
        if (!params.updateExisting) {
          skipped++;
          continue;
        }

        // Actualizar producto existente (EL STOCK NO SE TOCA SILENCIOSAMENTE)
        await this.ctx.db
          .prepare(
            `UPDATE products SET
              name = ?, description = ?, brand = ?, category_id = ?, unit = ?,
              price_cents = ?, cost_cents = ?, min_stock = ?, target_stock = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(rawName, description, brand, categoryId, unit, priceCents, costCents, minStock, targetStock, now, existing.id)
          .run();

        // Si trae código de barras, agregarlo si no lo tiene
        if (barcode) {
          await this.ctx.db
            .prepare(
              `INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active, created_at)
               VALUES (?, ?, 0, 1, ?)`,
            )
            .bind(existing.id, barcode, now)
            .run();
        }

        updated++;
      } else {
        // Insertar producto nuevo con batch atómico para producto + barcode + movimiento inicial
        const insertRes = await this.ctx.db
          .prepare(
            `INSERT INTO products (
              sku, name, description, brand, category_id, unit, price_cents, cost_cents,
              stock, min_stock, target_stock, active, last_movement_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          )
          .bind(
            rawSku,
            rawName,
            description,
            brand,
            categoryId,
            unit,
            priceCents,
            costCents,
            stock,
            minStock,
            targetStock,
            stock > 0 ? now : null,
            now,
            now,
          )
          .run();

        const productId = insertRes.meta.last_row_id;

        const subBatch: D1PreparedStatement[] = [];

        if (barcode) {
          subBatch.push(
            this.ctx.db
              .prepare(
                `INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active, created_at)
                 VALUES (?, ?, 1, 1, ?)`,
              )
              .bind(productId, barcode, now),
          );
        }

        if (stock > 0) {
          subBatch.push(
            this.ctx.db
              .prepare(
                `INSERT INTO stock_movements (
                  product_id, type, quantity, stock_before, stock_after, user_id, reason, ref_type, created_at
                ) VALUES (?, 'initial', ?, 0, ?, ?, 'Importación de inventario', 'import', ?)`,
              )
              .bind(productId, stock, stock, this.ctx.user.id, now),
          );
        }

        if (subBatch.length > 0) {
          await this.ctx.db.batch(subBatch);
        }

        imported++;
      }
    }

    await auditStmt(this.ctx, 'import.products', 'products', null, { imported, updated, skipped }).run();

    return { imported, updated, skipped };
  }

  /**
   * Exporta productos en formato CSV estándar.
   */
  async exportProductsCsv(): Promise<string> {
    const rows = await this.ctx.db
      .prepare(
        `SELECT p.id, p.sku, p.name, p.description, p.brand, c.name AS category,
                p.unit, p.price_cents, p.cost_cents, p.stock, p.min_stock, p.target_stock,
                p.active, p.created_at,
                (SELECT code FROM product_barcodes WHERE product_id = p.id AND active = 1 ORDER BY is_primary DESC LIMIT 1) AS barcode
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         ORDER BY p.id ASC`,
      )
      .all<any>();

    const isAdmin = this.ctx.user.role === 'admin';
    const headers = [
      'SKU',
      'Codigo_Barras',
      'Nombre',
      'Marca',
      'Categoria',
      'Unidad',
      'Precio_Venta_ARS',
      ...(isAdmin ? ['Costo_ARS'] : []),
      'Stock_Actual',
      'Stock_Minimo',
      'Stock_Objetivo',
      'Estado',
    ];

    const lines: string[] = [headers.join(',')];

    for (const r of rows.results) {
      const row = [
        csvEscape(r.sku),
        csvEscape(r.barcode || ''),
        csvEscape(r.name),
        csvEscape(r.brand || ''),
        csvEscape(r.category || ''),
        csvEscape(r.unit),
        (r.price_cents / 100).toFixed(2),
        ...(isAdmin ? [(r.cost_cents !== null ? (r.cost_cents / 100).toFixed(2) : '')] : []),
        r.stock,
        r.min_stock !== null ? r.min_stock : '',
        r.target_stock !== null ? r.target_stock : '',
        r.active === 1 ? 'Activo' : 'Inactivo',
      ];
      lines.push(row.join(','));
    }

    return lines.join('\r\n');
  }

  /**
   * Exporta historial de movimientos en formato CSV.
   */
  async exportMovementsCsv(productId?: number): Promise<string> {
    const where = productId ? 'WHERE sm.product_id = ?' : '';
    const stmt = this.ctx.db.prepare(
      `SELECT sm.id, sm.created_at, sm.type, sm.quantity, sm.stock_before, sm.stock_after,
              sm.reason, sm.ref_type, sm.ref_id,
              p.sku AS product_sku, p.name AS product_name,
              u.display_name AS user_name
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       JOIN users u ON u.id = sm.user_id
       ${where}
       ORDER BY sm.id DESC`,
    );

    const rows = await (productId ? stmt.bind(productId) : stmt).all<any>();

    const headers = [
      'ID_Movimiento',
      'Fecha_UTC',
      'SKU',
      'Producto',
      'Tipo_Operacion',
      'Cantidad',
      'Stock_Anterior',
      'Stock_Posterior',
      'Usuario_Responsable',
      'Motivo_Observacion',
      'Documento_Relacionado',
    ];

    const lines: string[] = [headers.join(',')];

    for (const r of rows.results) {
      const doc = r.ref_type && r.ref_id ? `${r.ref_type}:${r.ref_id}` : (r.ref_type || '');
      const row = [
        r.id,
        csvEscape(r.created_at),
        csvEscape(r.product_sku),
        csvEscape(r.product_name),
        csvEscape(r.type),
        r.quantity,
        r.stock_before,
        r.stock_after,
        csvEscape(r.user_name),
        csvEscape(r.reason || ''),
        csvEscape(doc),
      ];
      lines.push(row.join(','));
    }

    return lines.join('\r\n');
  }
}

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
