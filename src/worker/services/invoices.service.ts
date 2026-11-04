import type { ServiceContext } from '../env';
import { Errors } from '../lib/errors';
import { auditStmt, nowIso } from '../lib/db';
import { GeminiService } from './gemini.service';
import type {
  InvoiceParsedHeader,
  InvoiceMatchedItem,
  InvoiceConfirmRequest,
  MatchType,
} from '../../shared/schemas';

export class InvoicesService {
  constructor(private ctx: ServiceContext) {}

  /**
   * Procesa un PDF mediante Gemini y cruza cada ítem con el catálogo en D1.
   */
  async parseAndMatch(
    pdfBytes: Uint8Array | ArrayBuffer,
    injectedHeader?: InvoiceParsedHeader, // Permite inyectar datos en tests sin llamar a la API externa
  ): Promise<{
    invoice: InvoiceParsedHeader;
    items: InvoiceMatchedItem[];
    existingInvoiceWarning?: string | null;
  }> {
    let parsed: InvoiceParsedHeader;
    if (injectedHeader) {
      parsed = injectedHeader;
    } else {
      const gemini = new GeminiService(this.ctx.geminiApiKey, this.ctx.geminiModel);
      parsed = await gemini.extractInvoiceFromPdf(pdfBytes);
    }

    const cleanCuit = (parsed.supplierCuit || '').replace(/\D/g, '');

    // 1. Verificar si este comprobante ya fue ingresado previamente
    const existing = await this.ctx.db
      .prepare(
        `SELECT id, invoice_number, created_at
         FROM supplier_invoices
         WHERE invoice_number = ? AND (supplier_cuit = ? OR supplier_name = ?)
         LIMIT 1`,
      )
      .bind(parsed.invoiceNumber, parsed.supplierCuit || cleanCuit, parsed.supplierName)
      .first<{ id: number; invoice_number: string; created_at: string }>();

    let existingInvoiceWarning: string | null = null;
    if (existing) {
      existingInvoiceWarning = `Atención: Esta factura (${existing.invoice_number}) ya fue registrada previamente el ${existing.created_at.slice(0, 10)}.`;
    }

    // 2. Homologar cada ítem contra el inventario existente
    const matchedItems: InvoiceMatchedItem[] = [];

    for (let i = 0; i < parsed.items.length; i++) {
      const item = parsed.items[i];
      const rowId = `row_${i + 1}_${Math.random().toString(36).slice(2, 7)}`;
      const cleanCode = item.supplierCode.trim();

      if (item.lineType === 'charge') {
        matchedItems.push({
          ...item,
          id: rowId,
          matchType: 'charge',
          matchedProductId: null,
          matchedProductSku: null,
          matchedProductName: null,
          currentStock: null,
          currentCostCents: null,
          currentPriceCents: null,
          costDiffPercent: null,
          suggestedPriceCents: null,
          action: 'skip',
          updatePrice: false,
          saveAlias: false,
        });
        continue;
      }

      let matchType: MatchType = 'new_item';
      let matchedProduct: {
        id: number;
        sku: string;
        name: string;
        brand: string | null;
        price_cents: number;
        cost_cents: number | null;
        stock: number;
      } | null = null;

      // Paso 2a: Buscar por alias de proveedor previamente guardado
      if (cleanCuit) {
        matchedProduct = await this.ctx.db
          .prepare(
            `SELECT p.id, p.sku, p.name, p.brand, p.price_cents, p.cost_cents, p.stock
             FROM supplier_product_aliases a
             JOIN products p ON p.id = a.product_id
             WHERE (a.supplier_cuit = ? OR a.supplier_cuit = ?) AND a.supplier_code = ? COLLATE NOCASE
             LIMIT 1`,
          )
          .bind(parsed.supplierCuit || '', cleanCuit, cleanCode)
          .first<any>();

        if (matchedProduct) {
          matchType = 'alias';
        }
      }

      // Paso 2b: Si no hay alias, buscar por SKU directo
      if (!matchedProduct) {
        matchedProduct = await this.ctx.db
          .prepare(
            `SELECT id, sku, name, brand, price_cents, cost_cents, stock
             FROM products
             WHERE sku = ? COLLATE NOCASE
             LIMIT 1`,
          )
          .bind(cleanCode)
          .first<any>();

        if (matchedProduct) {
          matchType = 'exact_sku';
        }
      }

      // Paso 2c: Si no hay SKU, buscar por código de barras activo
      if (!matchedProduct) {
        matchedProduct = await this.ctx.db
          .prepare(
            `SELECT p.id, p.sku, p.name, p.brand, p.price_cents, p.cost_cents, p.stock
             FROM product_barcodes b
             JOIN products p ON p.id = b.product_id
             WHERE b.code = ? AND b.active = 1
             LIMIT 1`,
          )
          .bind(cleanCode)
          .first<any>();

        if (matchedProduct) {
          matchType = 'barcode';
        }
      }

      // Paso 2d: Si aún no coincide, buscar coincidencias parciales por nombre o SKU similar
      if (!matchedProduct) {
        matchedProduct = await this.ctx.db
          .prepare(
            `SELECT id, sku, name, brand, price_cents, cost_cents, stock
             FROM products
             WHERE (sku LIKE ? OR name LIKE ?) AND active = 1
             LIMIT 1`,
          )
          .bind(`%${cleanCode}%`, `%${cleanCode}%`)
          .first<any>();

        if (matchedProduct) {
          matchType = 'fuzzy';
        }
      }

      if (matchedProduct) {
        const curCost = matchedProduct.cost_cents || 0;
        let costDiffPercent: number | null = null;
        if (curCost > 0 && item.netUnitCostCents > 0) {
          costDiffPercent = Math.round(((item.netUnitCostCents - curCost) / curCost) * 1000) / 10;
        }

        let suggestedPriceCents = matchedProduct.price_cents;
        if (curCost > 0 && matchedProduct.price_cents > curCost && item.netUnitCostCents > 0) {
          const marginRatio = matchedProduct.price_cents / curCost;
          suggestedPriceCents = Math.round(item.netUnitCostCents * marginRatio);
        } else if (item.netUnitCostCents > 0) {
          suggestedPriceCents = Math.round(item.netUnitCostCents * 1.5);
        }

        matchedItems.push({
          ...item,
          id: rowId,
          matchType,
          matchedProductId: matchedProduct.id,
          matchedProductSku: matchedProduct.sku,
          matchedProductName: matchedProduct.name,
          currentStock: matchedProduct.stock,
          currentCostCents: matchedProduct.cost_cents,
          currentPriceCents: matchedProduct.price_cents,
          costDiffPercent,
          suggestedPriceCents,
          action: 'update_stock',
          updatePrice: false,
          saveAlias: matchType !== 'exact_sku',
        });
      } else {
        // Producto nuevo sugerido para dar de alta
        const suggestedPrice = Math.round(item.netUnitCostCents * 1.5);
        matchedItems.push({
          ...item,
          id: rowId,
          matchType: 'new_item',
          matchedProductId: null,
          matchedProductSku: null,
          matchedProductName: null,
          currentStock: 0,
          currentCostCents: null,
          currentPriceCents: null,
          costDiffPercent: null,
          suggestedPriceCents: suggestedPrice,
          action: 'create_and_stock',
          newSku: cleanCode,
          newName: item.description,
          newBrand: item.brand || undefined,
          newCostCents: item.netUnitCostCents,
          newPriceCents: suggestedPrice,
          updatePrice: true,
          saveAlias: true,
        });
      }
    }

    return {
      invoice: parsed,
      items: matchedItems,
      existingInvoiceWarning,
    };
  }

  /**
   * Confirma la factura de compra de forma atómica:
   * - Registra el comprobante en supplier_invoices
   * - Crea productos nuevos si corresponde
   * - Incrementa el stock e inserta movimientos inmutables en stock_movements
   * - Actualiza costos y precios si se seleccionó
   * - Guarda alias en supplier_product_aliases
   */
  async confirmIntake(params: InvoiceConfirmRequest): Promise<{
    success: boolean;
    invoiceId: number;
    updatedCount: number;
    createdCount: number;
    totalUnitsAdded: number;
  }> {
    const {
      idempotencyKey,
      supplierName,
      supplierCuit,
      invoiceNumber,
      invoiceDate,
      subtotalCents,
      taxCents,
      totalCents,
      notes,
      items,
    } = params;

    const validItems = items.filter((it) => it.action !== 'skip');
    if (validItems.length === 0) {
      throw Errors.badRequest('No se seleccionó ningún artículo para ingresar al stock.');
    }

    // 0. Verificar idempotencia
    const existingMovement = await this.ctx.db
      .prepare(`SELECT ref_id FROM stock_movements WHERE op_key LIKE ? AND ref_type = 'import' LIMIT 1`)
      .bind(`${idempotencyKey}%`)
      .first<{ ref_id: number }>();

    if (existingMovement && existingMovement.ref_id) {
      const inv = await this.ctx.db
        .prepare('SELECT id, items_count FROM supplier_invoices WHERE id = ?')
        .bind(existingMovement.ref_id)
        .first<{ id: number; items_count: number }>();

      if (inv) {
        return {
          success: true,
          invoiceId: inv.id,
          updatedCount: inv.items_count,
          createdCount: 0,
          totalUnitsAdded: 0,
        };
      }
    }

    const now = nowIso();
    const cleanCuit = supplierCuit ? supplierCuit.replace(/\D/g, '') : null;

    // 1. Guardar la cabecera de la factura en supplier_invoices
    const insertInvoiceStmt = this.ctx.db
      .prepare(
        `INSERT INTO supplier_invoices (
          supplier_name, supplier_cuit, invoice_number, invoice_date,
          subtotal_cents, tax_cents, total_cents, items_count, user_id, raw_data, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        supplierName.trim(),
        supplierCuit?.trim() || cleanCuit,
        invoiceNumber.trim(),
        invoiceDate,
        subtotalCents,
        taxCents,
        totalCents,
        validItems.length,
        this.ctx.user.id,
        JSON.stringify(params),
        notes?.trim() || null,
        now,
      );

    const invoiceResult = await insertInvoiceStmt.run();
    const invoiceId = invoiceResult.meta.last_row_id;

    let updatedCount = 0;
    let createdCount = 0;
    let totalUnitsAdded = 0;

    // 2. Procesar ítems mediante lote de transacciones
    const batchStmts: any[] = [];

    for (const item of validItems) {
      let productId = item.productId;

      if (item.action === 'create_and_stock') {
        const p = item.newProduct;
        if (!p || !p.sku || !p.name) {
          throw Errors.badRequest(`Datos incompletos para el nuevo producto con código "${item.supplierCode}".`);
        }

        // Crear producto nuevo con stock inicial en 0
        const prodInsert = await this.ctx.db
          .prepare(
            `INSERT INTO products (
              sku, name, brand, category_id, unit, price_cents, cost_cents, stock, min_stock, active, created_at, updated_at
            ) VALUES (?, ?, ?, NULL, 'unidad', ?, ?, 0, ?, 1, ?, ?)`,
          )
          .bind(
            p.sku.trim(),
            p.name.trim(),
            p.brand?.trim() || null,
            p.priceCents,
            item.netUnitCostCents,
            p.minStock ?? null,
            now,
            now,
          )
          .run();

        productId = prodInsert.meta.last_row_id;
        createdCount++;
      } else if (item.action === 'update_stock') {
        if (!productId) {
          throw Errors.badRequest(`Falta el identificador de producto para "${item.supplierCode}".`);
        }
        updatedCount++;
      }

      if (!productId) continue;

      // Obtener stock actual antes de mutar
      const current = await this.ctx.db
        .prepare('SELECT stock, cost_cents, price_cents FROM products WHERE id = ?')
        .bind(productId)
        .first<{ stock: number; cost_cents: number | null; price_cents: number }>();

      if (!current) {
        throw Errors.notFound(`El producto id ${productId}`);
      }

      const stockBefore = current.stock;
      const stockAfter = stockBefore + item.quantity;
      totalUnitsAdded += item.quantity;

      const reason = `Compra Factura ${invoiceNumber} (${supplierName})`;

      // Sentencia de actualización de producto (stock y opcionalmente precio y costo)
      if (item.updatePrice && item.newPriceCents !== undefined && item.newPriceCents > 0) {
        batchStmts.push(
          this.ctx.db
            .prepare(
              `UPDATE products
               SET stock = stock + ?, cost_cents = ?, price_cents = ?, last_movement_at = ?, updated_at = ?
               WHERE id = ?`,
            )
            .bind(item.quantity, item.netUnitCostCents, item.newPriceCents, now, now, productId),
        );
      } else {
        batchStmts.push(
          this.ctx.db
            .prepare(
              `UPDATE products
               SET stock = stock + ?, cost_cents = ?, last_movement_at = ?, updated_at = ?
               WHERE id = ?`,
            )
            .bind(item.quantity, item.netUnitCostCents, now, now, productId),
        );
      }

      // Sentencia de inserción en kardex (inmutable)
      const opKey = `${idempotencyKey}_item_${productId}_${Math.random().toString(36).slice(2, 6)}`;
      batchStmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO stock_movements (
              product_id, type, quantity, stock_before, stock_after, user_id, reason, ref_type, ref_id, op_key, created_at
            ) VALUES (?, 'purchase', ?, ?, ?, ?, ?, 'import', ?, ?, ?)`,
          )
          .bind(
            productId,
            item.quantity,
            stockBefore,
            stockAfter,
            this.ctx.user.id,
            reason,
            invoiceId,
            opKey,
            now,
          ),
      );

      // Si se indicó guardar alias para el proveedor
      if (item.saveAlias && (cleanCuit || supplierCuit) && item.supplierCode) {
        const cuitToSave = supplierCuit?.trim() || cleanCuit!;
        batchStmts.push(
          this.ctx.db
            .prepare(
              `INSERT OR REPLACE INTO supplier_product_aliases (
                supplier_cuit, supplier_code, product_id, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?)`,
            )
            .bind(cuitToSave, item.supplierCode.trim(), productId, now, now),
        );
      }
    }

    // Auditoría
    batchStmts.push(
      auditStmt(this.ctx, 'stock.supplier_invoice_intake', 'supplier_invoices', invoiceId, {
        supplierName,
        invoiceNumber,
        totalUnitsAdded,
        updatedCount,
        createdCount,
        idempotencyKey,
      }),
    );

    if (batchStmts.length > 0) {
      await this.ctx.db.batch(batchStmts);
    }

    return {
      success: true,
      invoiceId,
      updatedCount,
      createdCount,
      totalUnitsAdded,
    };
  }

  /**
   * Consulta el listado histórico de facturas cargadas.
   */
  async listInvoices(params: { page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const offset = (page - 1) * pageSize;

    const countRow = await this.ctx.db
      .prepare('SELECT COUNT(*) AS total FROM supplier_invoices')
      .first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const { results } = await this.ctx.db
      .prepare(
        `SELECT si.id, si.supplier_name, si.supplier_cuit, si.invoice_number, si.invoice_date,
                si.subtotal_cents, si.tax_cents, si.total_cents, si.items_count, si.notes, si.created_at,
                u.display_name AS user_name
         FROM supplier_invoices si
         JOIN users u ON u.id = si.user_id
         ORDER BY si.id DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(pageSize, offset)
      .all<any>();

    return {
      items: results || [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Obtiene el detalle de una factura y los movimientos generados.
   */
  async getInvoiceById(id: number) {
    const invoice = await this.ctx.db
      .prepare(
        `SELECT si.*, u.display_name AS user_name
         FROM supplier_invoices si
         JOIN users u ON u.id = si.user_id
         WHERE si.id = ?`,
      )
      .bind(id)
      .first<any>();

    if (!invoice) throw Errors.notFound('La factura de proveedor');

    const movements = await this.ctx.db
      .prepare(
        `SELECT sm.*, p.sku AS product_sku, p.name AS product_name
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         WHERE sm.ref_type = 'import' AND sm.ref_id = ?
         ORDER BY sm.id ASC`,
      )
      .bind(id)
      .all<any>();

    return {
      invoice,
      movements: movements.results || [],
    };
  }
}
