import { z } from 'zod';
import { formatARS } from './money';
import type { CustomerType } from './quotes';

export type { CustomerType };
export type AbcClassification = 'star' | 'cash_cow' | 'low_margin' | 'slow_moving';

export const customerVehicleSchema = z.object({
  id: z.number().int().positive().optional(),
  brand: z.string().trim().max(60).nullish(),
  model: z.string().trim().max(60).nullish(),
  year: z.number().int().min(1950).max(2050).nullish(),
  engine: z.string().trim().max(40).nullish(),
  plate: z.string().trim().max(20).nullish(),
  notes: z.string().trim().max(500).nullish(),
});
export type CustomerVehicleInput = z.infer<typeof customerVehicleSchema>;

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1, 'El nombre o razón social es obligatorio').max(150),
  customerType: z.enum(['particular', 'empresa']).default('particular'),
  phone: z.string().trim().max(40).nullish(),
  cuit: z.string().trim().max(25).nullish(),
  email: z.string().trim().email('Email inválido').max(150).nullish().or(z.literal('')),
  address: z.string().trim().max(250).nullish(),
  city: z.string().trim().max(100).default('San Carlos de Bariloche'),
  notes: z.string().trim().max(1000).nullish(),
  vehicles: z.array(customerVehicleSchema).optional(),
});
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;

export const customerUpdateSchema = customerCreateSchema.partial();
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const customerListQuerySchema = z.object({
  q: z.string().trim().optional(),
  customerType: z.enum(['all', 'particular', 'empresa']).default('all'),
  status: z.enum(['all', 'active', 'inactive']).default('all'), // inactive: > 60 días sin compras
  missing: z.enum(['all', 'phone', 'email', 'cuit']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export const analyticsPeriodQuerySchema = z.object({
  period: z
    .enum(['this_month', 'last_month', 'last_30_days', 'last_90_days', 'year_to_date', 'custom'])
    .default('this_month'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  brand: z.string().trim().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
});
export type AnalyticsPeriodQuery = z.infer<typeof analyticsPeriodQuerySchema>;

// Interfaces de datos
export interface CustomerVehicleDetail {
  id: number;
  customerId: number;
  brand: string | null;
  model: string | null;
  year: number | null;
  engine: string | null;
  plate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CustomerListItem {
  id: number;
  name: string;
  customerType: CustomerType;
  phone: string | null;
  cuit: string | null;
  email: string | null;
  city: string | null;
  totalSpentCents: number;
  salesCount: number;
  quotesCount: number;
  vehiclesCount: number;
  lastPurchaseAt: string | null;
  daysSinceLastPurchase: number | null;
  isInactive: boolean; // true si hace más de 60 días no compra
  createdAt: string;
}

export interface CustomerProfileDetail {
  id: number;
  name: string;
  customerType: CustomerType;
  phone: string | null;
  cuit: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  totalSpentCents: number;
  salesCount: number;
  quotesCount: number;
  quotesAcceptedCount: number;
  quoteConversionRatePct: number;
  averageTicketCents: number;
  lastPurchaseAt: string | null;
  daysSinceLastPurchase: number | null;
  isInactive: boolean;
  createdAt: string;
  updatedAt: string;
  vehicles: CustomerVehicleDetail[];
  recentSales: {
    id: number;
    saleNumber: string;
    totalCents: number;
    paymentMethodName: string;
    status: string;
    createdAt: string;
    itemsCount: number;
  }[];
  recentQuotes: {
    id: number;
    quoteNumber: string;
    totalCents: number;
    status: string;
    validUntil: string;
    isExpired: boolean;
    createdAt: string;
    vehicleSummary: string | null;
  }[];
}

// Analítica y Rentabilidad
export interface DailySalesPoint {
  date: string; // YYYY-MM-DD
  dayLabel: string; // "14 Nov", "Lun 14", etc.
  revenueCents: number;
  costCents: number;
  profitCents: number;
  marginPct: number;
  salesCount: number;
}

export interface ProductProfitabilityItem {
  productId: number;
  sku: string;
  name: string;
  brand: string | null;
  categoryName: string | null;
  unitsSold: number;
  revenueCents: number;
  costCents: number;
  profitCents: number;
  marginPct: number; // (Ganancia / Facturación) * 100
  currentStock: number;
  currentCostCents: number | null;
  currentPriceCents: number;
  abcClass: AbcClassification;
}

export interface BrandProfitabilityItem {
  brand: string;
  unitsSold: number;
  revenueCents: number;
  costCents: number;
  profitCents: number;
  marginPct: number;
  productsCount: number;
}

export interface PaymentMethodPerformanceItem {
  paymentMethodId: number;
  name: string;
  salesCount: number;
  totalCents: number;
  pctOfTotal: number;
}

export interface SellerPerformanceItem {
  userId: number;
  displayName: string;
  salesCount: number;
  revenueCents: number;
  profitCents: number;
  averageTicketCents: number;
}

export interface StoreAnalyticsSummary {
  periodLabel: string;
  from: string;
  to: string;
  revenueCents: number;
  costCents: number; // Costo de mercadería vendida (CMV)
  grossProfitCents: number; // Facturación - Costo
  grossMarginPct: number; // (Ganancia / Facturación) * 100
  salesCount: number;
  unitsSold: number;
  averageTicketCents: number;
  refundedCents: number;
  dailyTrend: DailySalesPoint[];
  byPaymentMethod: PaymentMethodPerformanceItem[];
  bySeller: SellerPerformanceItem[];
  topProfitableProducts: ProductProfitabilityItem[];
  topSellingProducts: ProductProfitabilityItem[];
  brandRanking: BrandProfitabilityItem[];
}

// Plantillas de fidelización para WhatsApp
export function buildCustomerWhatsAppMessage(
  customer: CustomerProfileDetail,
  intent: 'follow_up' | 'reactivation' | 'fleet_check' | 'direct',
  extraContext?: string,
): string {
  const greeting = `Hola *${customer.name}*, te contactamos de *Rodamientos Hugo* (Fagnano 1065, Bariloche) 👋`;

  if (intent === 'follow_up') {
    const quoteNote = extraContext ? `sobre el presupuesto *${extraContext}*` : 'sobre la cotización de repuestos que estuvimos viendo';
    return `${greeting}\n\nQueríamos consultarte si pudiste revisar la cotización ${quoteNote}. ¿Necesitás que te reservemos los repuestos o tenés alguna duda sobre marcas o disponibilidad?\n\n¡Estamos a disposición en el mostrador y por acá!`.trim();
  }

  if (intent === 'reactivation') {
    return `${greeting}\n\nHace un tiempo que no te vemos por el local y queríamos acercarte un saludo. Te recordamos que disponemos de rodamientos, retenes, correas y repuestos automotores e industriales con stock permanente en Bariloche.\n\nSi estás necesitando reponer stock para el taller o el mantenimiento de tus vehículos, ¡avisanos y te preparamos la cotización sin compromiso!`.trim();
  }

  if (intent === 'fleet_check') {
    const fleetStr = customer.vehicles.length > 0
      ? `tus unidades (${customer.vehicles.map((v) => `${v.brand || ''} ${v.model || ''} ${v.plate ? `[${v.plate}]` : ''}`.trim()).join(', ')})`
      : 'tus vehículos y maquinaria';
    return `${greeting}\n\nTe consultamos si requerís repuestos o rodamientos para el mantenimiento programado de ${fleetStr}. Tenemos líneas completas en SKF, FAG, INA y primeras marcas con entrega inmediata en mostrador.\n\n¡Cualquier consulta quedamos atentos!`.trim();
  }

  return `${greeting}\n\n¿En qué podemos ayudarte hoy?`.trim();
}
