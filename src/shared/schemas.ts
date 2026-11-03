/**
 * Esquemas de validación compartidos (cliente y servidor). El servidor es la autoridad final.
 */
import { z } from 'zod';
import { CODE_PATTERN } from './barcode';

const MAX_MONEY_CENTS = 1_000_000_000_00; // $ 1.000.000.000,00
const MAX_QTY = 1_000_000;

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} es obligatorio` })
    .trim()
    .min(min, min <= 1 ? `${label} es obligatorio` : `${label} debe tener al menos ${min} caracteres`)
    .max(max, `${label} admite hasta ${max} caracteres`);

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} admite hasta ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'Clave de operación inválida');

export const codeSchema = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().regex(CODE_PATTERN, 'Código inválido (1 a 64 caracteres imprimibles)'));

const cents = (label: string) =>
  z
    .number({ error: `${label} debe ser un número` })
    .int(`${label} debe estar en centavos enteros`)
    .min(0, `${label} no puede ser negativo`)
    .max(MAX_MONEY_CENTS, `${label} es demasiado alto`);

const qty = (label: string, min = 0) =>
  z
    .number({ error: `${label} debe ser un número` })
    .int(`${label} debe ser un número entero`)
    .min(min, min > 0 ? `${label} debe ser mayor a 0` : `${label} no puede ser negativo`)
    .max(MAX_QTY, `${label} es demasiado alto`);

// ---------------------------------------------------------------------------
// Autenticación y usuarios
// ---------------------------------------------------------------------------
export const roleSchema = z.enum(['admin', 'seller']);
export type Role = z.infer<typeof roleSchema>;

export const loginSchema = z.object({
  username: trimmed(1, 40, 'El usuario'),
  password: z.string().min(1, 'La contraseña es obligatoria').max(200),
});

const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(200, 'La contraseña es demasiado larga');

const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{3,40}$/, 'Usuario: 3 a 40 caracteres (letras, números, punto, guion)');

export const setupSchema = z.object({
  token: z.string().min(1, 'El token de configuración es obligatorio'),
  username: usernameSchema,
  displayName: trimmed(1, 80, 'El nombre'),
  password: passwordSchema,
});

export const userCreateSchema = z.object({
  username: usernameSchema,
  displayName: trimmed(1, 80, 'El nombre'),
  password: passwordSchema,
  role: roleSchema,
});

export const userUpdateSchema = z.object({
  displayName: trimmed(1, 80, 'El nombre').optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  password: passwordSchema.optional(),
});

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------
const productBase = {
  sku: trimmed(1, 64, 'El SKU / código interno').regex(CODE_PATTERN, 'SKU con caracteres inválidos'),
  name: trimmed(1, 200, 'El nombre'),
  description: optionalText(2000, 'La descripción'),
  brand: optionalText(80, 'La marca'),
  categoryName: optionalText(80, 'La categoría'),
  unit: trimmed(1, 20, 'La unidad de medida').default('unidad'),
  priceCents: cents('El precio de venta'),
  costCents: cents('El costo').nullish().transform((v) => (v === undefined ? null : v)),
  minStock: qty('El stock mínimo').nullish().transform((v) => (v === undefined ? null : v)),
  targetStock: qty('El stock objetivo').nullish().transform((v) => (v === undefined ? null : v)),
  barcodes: z.array(codeSchema).max(10, 'Máximo 10 códigos por producto').default([]),
};

function refineStock<T extends { minStock: number | null; targetStock: number | null; barcodes: string[] }>(
  data: T,
  ctx: z.RefinementCtx,
) {
  if (data.minStock !== null && data.targetStock !== null && data.targetStock < data.minStock) {
    ctx.addIssue({ code: 'custom', path: ['targetStock'], message: 'El stock objetivo no puede ser menor al mínimo' });
  }
  const seen = new Set<string>();
  data.barcodes.forEach((c, i) => {
    if (seen.has(c)) ctx.addIssue({ code: 'custom', path: ['barcodes', i], message: `Código repetido: ${c}` });
    seen.add(c);
  });
}

/** Alta de producto. `initialStock` genera un movimiento de "Stock inicial". */
export const productCreateSchema = z
  .strictObject({
    ...productBase,
    initialStock: qty('El stock inicial').default(0),
  })
  .superRefine(refineStock);

/** Edición de producto. El stock NO se puede modificar aquí (strictObject rechaza el campo). */
export const productUpdateSchema = z.strictObject(productBase).superRefine(refineStock);

export type ProductCreateInput = z.input<typeof productCreateSchema>;
export type ProductUpdateInput = z.input<typeof productUpdateSchema>;

export const productListQuerySchema = z.object({
  q: z.string().trim().max(40, 'Búsqueda demasiado larga').optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  brand: z.string().trim().max(80).optional(),
  status: z.enum(['all', 'out', 'low', 'ok', 'no_min', 'alert']).default('all'),
  active: z.enum(['1', '0', 'all']).default('1'),
  sort: z.enum(['name', 'sku', 'stock', 'price', 'updated', 'brand']).default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// ---------------------------------------------------------------------------
// Movimientos de stock
// ---------------------------------------------------------------------------
export const stockEntrySchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  productId: z.number().int().positive(),
  quantity: qty('La cantidad', 1),
  kind: z.enum(['purchase', 'initial']).default('purchase'),
  reason: optionalText(500, 'La observación'),
});

export const stockAdjustmentSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  productId: z.number().int().positive(),
  direction: z.enum(['in', 'out']),
  quantity: qty('La cantidad', 1),
  reason: trimmed(3, 500, 'El motivo del ajuste'),
});

export const movementListQuerySchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  type: z.enum(['initial', 'purchase', 'sale', 'return', 'adjust_in', 'adjust_out', 'reversal']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  initial: 'Stock inicial',
  purchase: 'Entrada de mercadería',
  sale: 'Venta',
  return: 'Devolución',
  adjust_in: 'Ajuste positivo',
  adjust_out: 'Ajuste negativo',
  reversal: 'Anulación',
};

// ---------------------------------------------------------------------------
// Ventas y devoluciones
// ---------------------------------------------------------------------------
export const saleCreateSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    paymentMethodId: z.number({ error: 'Seleccioná un medio de pago' }).int().positive('Seleccioná un medio de pago'),
    discountCents: cents('El descuento').default(0),
    notes: optionalText(500, 'La nota'),
    items: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          quantity: qty('La cantidad', 1),
          expectedUnitPriceCents: cents('El precio'),
        }),
      )
      .min(1, 'La venta no tiene artículos')
      .max(100, 'Máximo 100 artículos distintos por venta'),
  })
  .superRefine((data, ctx) => {
    const ids = new Set<number>();
    data.items.forEach((it, i) => {
      if (ids.has(it.productId)) {
        ctx.addIssue({ code: 'custom', path: ['items', i], message: 'Producto repetido en la venta' });
      }
      ids.add(it.productId);
    });
  });
export type SaleCreateInput = z.input<typeof saleCreateSchema>;

export const saleReturnSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  reason: trimmed(3, 500, 'El motivo'),
  items: z
    .array(
      z.object({
        saleItemId: z.number().int().positive(),
        quantity: qty('La cantidad', 1),
        restock: z.boolean().default(true),
      }),
    )
    .min(1, 'Indicá al menos un artículo a devolver')
    .max(100),
});

export const saleVoidSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  reason: trimmed(3, 500, 'El motivo'),
});

export const saleListQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------
export const alertsQuerySchema = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  brand: z.string().trim().max(80).optional(),
  status: z.enum(['all', 'out', 'low', 'no_min']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// ---------------------------------------------------------------------------
// Configuración y medios de pago
// ---------------------------------------------------------------------------
export const settingsSchema = z.object({
  businessName: trimmed(1, 80, 'El nombre del comercio'),
  maxSellerDiscountPct: z.number().min(0).max(100),
  replenishmentFallbackFactor: z.number().min(1).max(10),
  receiptFooter: z.string().trim().max(300),
});
export type Settings = z.infer<typeof settingsSchema>;

export const paymentMethodSchema = z.object({
  name: trimmed(1, 40, 'El nombre'),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

// ---------------------------------------------------------------------------
// Importación
// ---------------------------------------------------------------------------
export const IMPORT_COLUMNS = [
  'sku',
  'codigo_barras',
  'nombre',
  'descripcion',
  'marca',
  'categoria',
  'unidad',
  'precio_venta',
  'costo',
  'stock_inicial',
  'stock_minimo',
  'stock_objetivo',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export const IMPORT_MAX_ROWS = 1000;

export const importRequestSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))
    .min(1, 'El archivo no tiene filas')
    .max(IMPORT_MAX_ROWS, `Máximo ${IMPORT_MAX_ROWS} filas por importación. Dividí el archivo.`),
  updateExisting: z.boolean().default(false),
  skipInvalid: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Facturas de proveedores (Ingreso inteligente con IA)
// ---------------------------------------------------------------------------
export const invoiceParsedItemSchema = z.object({
  supplierCode: z.string().trim(),
  description: z.string().trim(),
  brand: z.string().trim().nullish(),
  quantity: z.number().int().min(1),
  listPriceCents: z.number().int().min(0).default(0),
  discountPercent: z.number().min(0).max(100).default(0),
  netUnitCostCents: z.number().int().min(0),
  totalNetCents: z.number().int().min(0).default(0),
  lineType: z.enum(['product', 'charge']).default('product'),
});
export type InvoiceParsedItem = z.infer<typeof invoiceParsedItemSchema>;

export const invoiceParsedHeaderSchema = z.object({
  supplierName: z.string().trim().min(1),
  supplierCuit: z.string().trim().nullish(),
  invoiceType: z.string().trim().default('A'),
  invoiceNumber: z.string().trim().min(1),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  subtotalNetCents: z.number().int().min(0).default(0),
  taxCents: z.number().int().min(0).default(0),
  totalCents: z.number().int().min(0).default(0),
  items: z.array(invoiceParsedItemSchema),
});
export type InvoiceParsedHeader = z.infer<typeof invoiceParsedHeaderSchema>;

export type MatchType = 'exact_sku' | 'alias' | 'barcode' | 'fuzzy' | 'new_item' | 'charge';

export interface InvoiceMatchedItem extends InvoiceParsedItem {
  id: string; // Identificador temporal de fila en UI
  matchType: MatchType;
  matchedProductId: number | null;
  matchedProductSku: string | null;
  matchedProductName: string | null;
  currentStock: number | null;
  currentCostCents: number | null;
  currentPriceCents: number | null;
  costDiffPercent: number | null; // Variación porcentual (ej: +14.2)
  suggestedPriceCents: number | null;
  // Acciones en la UI
  action: 'update_stock' | 'create_and_stock' | 'skip';
  newSku?: string;
  newName?: string;
  newBrand?: string;
  newPriceCents?: number;
  newCostCents?: number;
  updatePrice: boolean;
  saveAlias: boolean;
}

export const invoiceConfirmItemSchema = z.object({
  action: z.enum(['update_stock', 'create_and_stock', 'skip']),
  supplierCode: z.string().trim(),
  quantity: z.number().int().min(1),
  netUnitCostCents: z.number().int().min(0),
  productId: z.number().int().positive().optional(),
  newProduct: z
    .object({
      sku: z.string().trim().min(1).max(64),
      name: z.string().trim().min(1).max(200),
      brand: z.string().trim().max(80).nullish(),
      categoryName: z.string().trim().max(80).nullish(),
      priceCents: z.number().int().min(0),
      costCents: z.number().int().min(0),
      minStock: z.number().int().min(0).nullish(),
    })
    .optional(),
  updatePrice: z.boolean().default(false),
  newPriceCents: z.number().int().min(0).optional(),
  saveAlias: z.boolean().default(true),
});

export const invoiceConfirmRequestSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  supplierName: z.string().trim().min(1).max(120),
  supplierCuit: z.string().trim().max(20).nullish(),
  invoiceNumber: z.string().trim().min(1).max(50),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato YYYY-MM-DD'),
  subtotalCents: z.number().int().min(0).default(0),
  taxCents: z.number().int().min(0).default(0),
  totalCents: z.number().int().min(0).default(0),
  notes: z.string().trim().max(500).nullish(),
  items: z.array(invoiceConfirmItemSchema).min(1, 'Debe incluir al menos un artículo a ingresar'),
});
export type InvoiceConfirmRequest = z.infer<typeof invoiceConfirmRequestSchema>;
