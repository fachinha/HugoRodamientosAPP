import { z } from 'zod';

export type PaywayReconciliationStatus =
  | 'accredited'
  | 'pending'
  | 'missing_in_payway'
  | 'unknown_purchase_dispute';

export const PAYWAY_STATUS_LABELS: Record<PaywayReconciliationStatus, string> = {
  accredited: 'Acreditado en Sábana Bancaria (OK)',
  pending: 'En plazo de acreditación',
  missing_in_payway: '⚠️ No figura en Payway (Revisar Cierre de Lote)',
  unknown_purchase_dispute: '🚨 Compra Desconocida / Contracargo Payway',
};

export const cashflowEntryCreateSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  direction: z.enum(['in', 'out']),
  category: z
    .enum([
      'venta_mostrador',
      'acreditacion_payway',
      'cobro_cta_cte',
      'pago_proveedor',
      'flete_expreso',
      'impuestos_afip',
      'alquiler_servicios',
      'otro',
    ])
    .default('pago_proveedor'),
  description: z.string().trim().min(2, 'Ingresá una descripción').max(250),
  bankOrBox: z.string().trim().min(1).max(100).default('Caja Efectivo'),
  amountCents: z.number().int().min(1, 'El monto debe ser mayor a 0'),
  status: z.enum(['projected', 'confirmed']).default('projected'),
});
export type CashflowEntryCreateInput = z.infer<typeof cashflowEntryCreateSchema>;

export const paywayBankRuleSchema = z.object({
  bankEvenDays: z.string().trim().min(2, 'Indicá el banco para días pares').max(120),
  bankOddDays: z.string().trim().min(2, 'Indicá el banco para días impares').max(120),
});
export type PaywayBankRuleInput = z.infer<typeof paywayBankRuleSchema>;

export const paywayStatusUpdateSchema = z.object({
  reconciliationStatus: z.enum(['accredited', 'pending', 'missing_in_payway', 'unknown_purchase_dispute']),
  disputeReason: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(500).nullish(),
});
export type PaywayStatusUpdateInput = z.infer<typeof paywayStatusUpdateSchema>;

export const automotivePadronCreateSchema = z.object({
  vehicleBrand: z.string().trim().min(1, 'La marca es obligatoria').max(60),
  vehicleModel: z.string().trim().min(1, 'El modelo es obligatorio').max(80),
  vehicleCategory: z.string().trim().max(60).default('Pick-up / Utilitario'),
  yearsRange: z.string().trim().max(40).default('2010-2026'),
  commonBearings: z.string().trim().min(2, 'Indicá los rodamientos o retenes habituales').max(400),
  activeUnitsEst: z.number().int().min(1).default(50),
  notes: z.string().trim().max(500).nullish(),
});
export type AutomotivePadronCreateInput = z.infer<typeof automotivePadronCreateSchema>;

export interface CashflowDayRow {
  date: string; // YYYY-MM-DD
  dayLabel: string;
  dayNumber: number;
  dayParity: 'par' | 'impar';
  assignedBank: string;
  openingBalanceCents: number;
  cashAndTransferSalesCents: number;
  paywaySettlementsCents: number;
  currentAccountAndChequesInCents: number;
  otherIncomeCents: number;
  supplierAndFreightOutCents: number;
  taxesAndFixedOutCents: number;
  netDailyFlowCents: number;
  closingProjectedBalanceCents: number;
  details: string[];
}

export interface PaywayReconciliationItem {
  id: number;
  saleId: number | null;
  saleDate: string;
  dayParity: 'par' | 'impar';
  assignedBank: string;
  cardType: 'debito' | 'credito';
  cardBrand: string;
  installments: number;
  grossAmountCents: number;
  paywayFeeCents: number;
  expectedNetCents: number;
  expectedPayoutDate: string;
  couponNumber: string | null;
  reconciliationStatus: PaywayReconciliationStatus;
  disputeReason: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface WhatsAppAgendaItem {
  key: string;
  contactKind: 'customer' | 'supplier';
  entityId: number;
  rawName: string;
  formattedPhoneBookName: string; // Ej: "CLI - Taller El Cóndor (Bariloche)" o "PROV - Alfa Rodamientos"
  phone: string;
  normalizedWhatsApp: string;
  cuit: string | null;
  city: string | null;
  detailTag: string; // Vehículos o marcas que provee
  isProperlyNamed: boolean;
}

export interface AutomotivePadronItem {
  id: number;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleCategory: string;
  yearsRange: string;
  commonBearings: string;
  activeUnitsEst: number;
  queriesCount: number;
  salesCount: number;
  notes: string | null;
}

export interface ActiveCompanyStatItem {
  id: number;
  name: string;
  cuit: string | null;
  phone: string | null;
  city: string | null;
  vehiclesCount: number;
  vehiclesSummary: string;
  quotesCount: number;
  salesAndAccountTotalCents: number;
  isActiveCompany: boolean;
}
