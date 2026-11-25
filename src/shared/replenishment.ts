import { z } from 'zod';

export type ReplenishmentOriginReason = 'sold_today' | 'low_stock' | 'customer_deposit' | 'manual';
export type PurchaseOrderStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export const ORIGIN_REASON_LABELS: Record<ReplenishmentOriginReason, string> = {
  sold_today: 'Vendido en el día',
  low_stock: 'Faltante / Stock bajo',
  customer_deposit: 'Seña de cliente (A pedir)',
  manual: 'Buscado / Escaneado',
};

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Borrador',
  ordered: 'En camino (Pendiente de llegada)',
  received: 'Llegó al local (Sumado al stock)',
  cancelled: 'Anulado',
};

// 1. Alta / Edición de Proveedor
export const supplierCreateSchema = z.object({
  name: z.string().trim().min(1, 'El nombre del proveedor es obligatorio').max(120),
  cuit: z.string().trim().max(25).nullish(),
  phone: z.string().trim().max(40).nullish(),
  email: z.string().trim().max(150).nullish(),
  contactPerson: z.string().trim().max(100).nullish(),
  city: z.string().trim().max(100).default('Buenos Aires'),
  leadTimeDays: z.number().int().min(1).max(90).default(3),
  leadTimeAlertDays: z.number().int().min(1).max(90).default(5),
  freightPct: z.number().min(0).max(200).default(5.5),
  paymentTerms: z.string().trim().max(150).default('Cuenta corriente 30 días'),
  brandsSupplied: z.string().trim().max(300).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});
export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export const supplierUpdateSchema = supplierCreateSchema.partial();
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;

// 2. Opción de precio y demora de un proveedor para un producto
export const productSupplierOptionSchema = z.object({
  productId: z.number().int().positive(),
  supplierId: z.number().int().positive(),
  supplierCode: z.string().trim().max(80).nullish(),
  brandOffered: z.string().trim().max(80).nullish(),
  unitCostCents: z.number().int().min(0),
  freightPct: z.number().min(0).max(200).default(5.5),
  leadTimeDays: z.number().int().min(1).max(90).default(3),
  isPreferred: z.boolean().default(false),
});
export type ProductSupplierOptionInput = z.infer<typeof productSupplierOptionSchema>;

// 3. Creación de Orden de Pedido a Proveedor (incluye quién realiza el pedido)
export const purchaseOrderCreateSchema = z.object({
  supplierId: z.number().int().positive().nullish(),
  supplierName: z.string().trim().min(1, 'Seleccioná un proveedor').max(120),
  supplierPhone: z.string().trim().max(40).nullish(),
  leadTimeDays: z.number().int().min(1).max(90).default(3),
  freightPct: z.number().min(0).max(200).default(5.5),
  orderedByName: z.string().trim().min(2, 'Indicá quién realiza el pedido').max(100).optional(),
  notes: z.string().trim().max(1000).nullish(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive().nullish(),
        depositId: z.number().int().positive().nullish(),
        sku: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(250),
        brand: z.string().trim().max(80).nullish(),
        supplierCode: z.string().trim().max(80).nullish(),
        originReason: z.enum(['sold_today', 'low_stock', 'customer_deposit', 'manual']).default('low_stock'),
        quantity: z.number().int().min(1),
        unitCostCents: z.number().int().min(0),
        freightPct: z.number().min(0).max(200).default(0),
      }),
    )
    .min(1, 'Debés incluir al menos un artículo en el pedido al proveedor'),
});
export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;

// 4. Actualización de estado / Confirmación de llegada de pedido (quién confirma que llegó)
export const purchaseOrderStatusUpdateSchema = z.object({
  status: z.enum(['draft', 'ordered', 'received', 'cancelled']),
  receivedByName: z.string().trim().max(100).nullish(),
  receptionNotes: z.string().trim().max(500).nullish(),
});
export type PurchaseOrderStatusUpdateInput = z.infer<typeof purchaseOrderStatusUpdateSchema>;

export interface SupplierDetail {
  id: number;
  name: string;
  cuit: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  city: string | null;
  leadTimeDays: number;
  leadTimeAlertDays: number;
  hasDelayAlert: boolean;
  freightPct: number;
  paymentTerms: string | null;
  brandsSupplied: string | null;
  notes: string | null;
  productsCount?: number;
  active: boolean;
  createdAt: string;
}

export interface SupplierOptionComparison {
  optionId: number;
  supplierId: number;
  supplierName: string;
  supplierPhone: string | null;
  supplierCode: string | null;
  brandOffered: string | null;
  unitCostCents: number;
  freightPct: number;
  landedUnitCostCents: number;
  leadTimeDays: number;
  leadTimeAlertDays: number;
  hasDelayAlert: boolean;
  isCheapest: boolean;
  isFastest: boolean;
  isPreferred: boolean;
}

export interface ReplenishmentCandidateItem {
  key: string;
  productId: number | null;
  depositId: number | null;
  sku: string;
  primaryBarcode?: string | null;
  defaultSupplierName?: string | null;
  name: string;
  brand: string | null;
  location: string | null;
  dimensions: string | null;
  currentStock: number;
  minStock: number | null;
  targetStock: number | null;
  soldTodayQty: number;
  customerDepositQty: number;
  depositCustomerName: string | null;
  depositNumber: string | null;
  alreadyOrderedQty: number;
  pendingOrderNumbers: string[];
  suggestedOrderQty: number;
  originReasons: ReplenishmentOriginReason[];
  isAlreadyCoveredByOrder: boolean;
  supplierOptions: SupplierOptionComparison[];
  recommendedSupplierId: number | null;
}

export interface PurchaseOrderItemDetail {
  id: number;
  orderId: number;
  productId: number | null;
  depositId: number | null;
  sku: string;
  name: string;
  brand: string | null;
  supplierCode: string | null;
  originReason: ReplenishmentOriginReason;
  quantity: number;
  unitCostCents: number;
  freightPct: number;
  landedUnitCostCents: number;
  lineTotalCents: number;
}

export interface PurchaseOrderDetail {
  id: number;
  orderNumber: string;
  supplierId: number | null;
  supplierName: string;
  supplierPhone: string | null;
  status: PurchaseOrderStatus;
  leadTimeDays: number;
  expectedArrivalDate: string | null;
  hasDelayAlert: boolean;
  subtotalCents: number;
  freightPct: number;
  freightCents: number;
  totalCents: number;
  itemsCount: number;
  notes: string | null;
  userId: number;
  userName: string;
  orderedByName: string;
  receivedByUserId: number | null;
  receivedByName: string | null;
  receivedAt: string | null;
  receptionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseOrderItemDetail[];
}
