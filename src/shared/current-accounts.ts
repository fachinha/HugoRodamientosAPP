import { z } from 'zod';

export type AccountMovementType = 'commitment' | 'receipt';
export type AccountPaymentFormat = 'efectivo' | 'transferencia' | 'cheque' | 'mercado_libre' | 'tarjeta' | 'mixto';
export type DepositStatus =
  | 'pending_order'
  | 'ordered_to_supplier'
  | 'arrived_in_store'
  | 'delivered_and_settled'
  | 'cancelled';

export const PAYMENT_FORMAT_LABELS: Record<AccountPaymentFormat, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia Bancaria',
  cheque: 'Cheque / E-Cheq',
  mercado_libre: 'Mercado Libre / Mercado Pago',
  tarjeta: 'Tarjeta Débito / Crédito',
  mixto: 'Mixto (Varios formatos)',
};

export const DEPOSIT_STATUS_LABELS: Record<DepositStatus, string> = {
  pending_order: 'Pendiente de pedir al proveedor',
  ordered_to_supplier: 'Ya pedido al proveedor (En camino)',
  arrived_in_store: 'En el local (Avisar al cliente)',
  delivered_and_settled: 'Entregado y saldo cancelado',
  cancelled: 'Anulado / Devuelto',
};

export const paymentBreakdownLineSchema = z.object({
  format: z.enum(['efectivo', 'transferencia', 'cheque', 'mercado_libre', 'tarjeta']),
  amountCents: z.number().int().min(1, 'El monto debe ser mayor a 0'),
  reference: z.string().trim().max(120).nullish(),
  chequeNumber: z.string().trim().max(60).nullish(),
  chequeBank: z.string().trim().max(80).nullish(),
  chequeDueDate: z.string().trim().max(20).nullish(),
});
export type PaymentBreakdownLine = z.infer<typeof paymentBreakdownLineSchema>;

// 1. Compromiso de Pago (Cliente retira mercadería a cuenta corriente con N° Factura / Remito)
export const accountCommitmentCreateSchema = z.object({
  customerId: z.number().int().positive().nullish(),
  customerName: z.string().trim().min(1, 'El nombre del cliente o empresa es obligatorio').max(150),
  customerPhone: z.string().trim().max(40).nullish(),
  customerCuit: z.string().trim().max(25).nullish(),
  invoiceNumber: z.string().trim().max(60).nullish(),
  remitoNumber: z.string().trim().max(60).nullish(),
  saleId: z.number().int().positive().nullish(),
  promisedPaymentDate: z.string().trim().max(20).nullish(),
  withdrawnByName: z.string().trim().max(100).nullish(),
  itemsSummary: z.string().trim().min(2, 'Detallá la mercadería retirada').max(1000),
  amountCents: z.number().int().min(1, 'El importe del compromiso debe ser mayor a 0'),
  notes: z.string().trim().max(1000).nullish(),
});
export type AccountCommitmentCreateInput = z.infer<typeof accountCommitmentCreateSchema>;

// 2. Recibo de Dinero a Cuenta (Pago total, parcial o anticipo en efectivo, transferencia, cheque, Mercado Libre o mixto)
export const accountReceiptCreateSchema = z.object({
  customerId: z.number().int().positive().nullish(),
  customerName: z.string().trim().min(1, 'El nombre del cliente o empresa es obligatorio').max(150),
  customerPhone: z.string().trim().max(40).nullish(),
  customerCuit: z.string().trim().max(25).nullish(),
  invoiceNumber: z.string().trim().max(60).nullish(),
  remitoNumber: z.string().trim().max(60).nullish(),
  paymentFormat: z.enum(['efectivo', 'transferencia', 'cheque', 'mercado_libre', 'tarjeta', 'mixto']).default('efectivo'),
  breakdown: z.array(paymentBreakdownLineSchema).optional(),
  chequeNumber: z.string().trim().max(60).nullish(),
  chequeBank: z.string().trim().max(80).nullish(),
  chequeDueDate: z.string().trim().max(20).nullish(),
  amountCents: z.number().int().min(1, 'El importe del recibo debe ser mayor a 0'),
  notes: z.string().trim().max(1000).nullish(),
});
export type AccountReceiptCreateInput = z.infer<typeof accountReceiptCreateSchema>;

// 3. Registro de Seña a cuenta de productos que deben pedirse
export const depositCreateSchema = z.object({
  customerId: z.number().int().positive().nullish(),
  customerName: z.string().trim().min(1, 'El nombre del cliente es obligatorio').max(150),
  customerPhone: z.string().trim().max(40).nullish(),
  productId: z.number().int().positive().nullish(),
  productSku: z.string().trim().max(64).nullish(),
  productDescription: z.string().trim().min(2, 'Indicá qué producto o repuesto debe pedirse').max(250),
  brand: z.string().trim().max(80).nullish(),
  supplierName: z.string().trim().max(120).nullish(),
  quantity: z.number().int().min(1).default(1),
  estimatedUnitPriceCents: z.number().int().min(0).default(0),
  depositAmountCents: z.number().int().min(1, 'El monto de la seña debe ser mayor a 0'),
  paymentFormat: z.enum(['efectivo', 'transferencia', 'cheque', 'mercado_libre', 'tarjeta']).default('efectivo'),
  paymentReference: z.string().trim().max(120).nullish(),
  estimatedArrivalDate: z.string().trim().max(20).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});
export type DepositCreateInput = z.infer<typeof depositCreateSchema>;

export const depositStatusUpdateSchema = z.object({
  status: z.enum(['pending_order', 'ordered_to_supplier', 'arrived_in_store', 'delivered_and_settled', 'cancelled']),
  supplierName: z.string().trim().max(120).nullish(),
  estimatedArrivalDate: z.string().trim().max(20).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});
export type DepositStatusUpdateInput = z.infer<typeof depositStatusUpdateSchema>;

export interface AccountMovementDetail {
  id: number;
  movementNumber: string;
  customerId: number | null;
  customerName: string;
  customerPhone: string | null;
  customerCuit: string | null;
  movementType: AccountMovementType;
  invoiceNumber: string | null;
  remitoNumber: string | null;
  saleId: number | null;
  promisedPaymentDate: string | null;
  withdrawnByName: string | null;
  itemsSummary: string | null;
  paymentFormat: AccountPaymentFormat | null;
  paymentBreakdown: PaymentBreakdownLine[];
  chequeNumber: string | null;
  chequeBank: string | null;
  chequeDueDate: string | null;
  amountCents: number;
  notes: string | null;
  userId: number;
  userName: string;
  createdAt: string;
}

export interface CustomerAccountBalanceItem {
  customerName: string;
  customerId: number | null;
  customerPhone: string | null;
  customerCuit: string | null;
  totalCommitmentsCents: number; // Mercadería retirada (Debe)
  totalReceiptsCents: number;    // Dinero entregado a cuenta / Recibos (Haber)
  balanceCents: number;          // > 0 = Deuda del cliente; < 0 = Saldo a favor del cliente (dinero a cuenta)
  movementsCount: number;
  lastMovementAt: string;
  nextPromisedDate: string | null;
}

export interface CustomerDepositDetail {
  id: number;
  depositNumber: string;
  customerId: number | null;
  customerName: string;
  customerPhone: string | null;
  productId: number | null;
  productSku: string | null;
  productDescription: string;
  brand: string | null;
  supplierName: string | null;
  quantity: number;
  estimatedUnitPriceCents: number;
  estimatedTotalCents: number;
  depositAmountCents: number;
  remainingBalanceCents: number;
  paymentFormat: 'efectivo' | 'transferencia' | 'cheque' | 'mercado_libre' | 'tarjeta';
  paymentReference: string | null;
  estimatedArrivalDate: string | null;
  status: DepositStatus;
  notes: string | null;
  userId: number;
  userName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientDirectoryItem {
  id: number;
  name: string;
  customerType: 'particular' | 'empresa';
  phone: string | null;
  cuit: string | null;
  email: string | null;
  city: string | null;
  accountBalanceCents: number;
  totalCommitmentsCents: number;
  totalReceiptsCents: number;
  quotesCount: number;
  openQuotesCount: number;
  overdueQuotesCount: number;
  oldestPendingQuoteDays: number | null;
  oldestPendingQuoteNumber: string | null;
  depositsCount: number;
  pendingDepositsCount: number;
  arrivedUncollectedCount: number;
  vehiclesCount: number;
  hasOverdueFollowUp: boolean;
  overdueReasonSummary: string | null;
  createdAt: string;
}

export interface OverdueFollowUpItem {
  kind: 'quote_uncollected' | 'deposit_arrived' | 'account_overdue';
  customerId: number | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  referenceId: number;
  referenceNumber: string;
  createdAt: string;
  daysElapsed: number;
  amountCents: number;
  summary: string;
  vehicleSummary: string | null;
}

export interface ClientQuoteSummaryItem {
  id: number;
  quoteNumber: string;
  trackingNumber: string | null;
  status: string;
  followUpStatus: string;
  totalCents: number;
  validUntil: string;
  createdAt: string;
  daysElapsed: number;
  isPendingPickup: boolean;
  isOverdueFollowUp: boolean;
  vehicleSummary: string | null;
  itemsSummary: string;
}

export interface Client360Profile {
  id: number;
  name: string;
  customerType: 'particular' | 'empresa';
  phone: string | null;
  cuit: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  accountBalanceCents: number;
  totalCommitmentsCents: number;
  totalReceiptsCents: number;
  hasOverdueFollowUp: boolean;
  overdueReasons: string[];
  vehicles: {
    id: number;
    brand: string | null;
    model: string | null;
    year: number | null;
    engine: string | null;
    plate: string | null;
  }[];
  accountMovements: AccountMovementDetail[];
  quotes: ClientQuoteSummaryItem[];
  deposits: CustomerDepositDetail[];
  recentSales: {
    id: number;
    saleNumber: string;
    totalCents: number;
    status: string;
    createdAt: string;
  }[];
}
