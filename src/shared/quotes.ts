import { z } from 'zod';
import { formatARS } from './money';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
export type FollowUpStatus = 'pending' | 'following' | 'accredited' | 'not_viable';
export type CustomerType = 'particular' | 'empresa';
export type ItemAvailability = 'in_stock' | 'to_order' | 'confirm_lead_time';

export const QUOTE_LOSS_REASONS = [
  'Precio / Más barato en otro comercio',
  'No teníamos stock inmediato en salón',
  'Demora de entrega del proveedor',
  'El cliente no desarmó / Suspendió reparación',
  'Solo consultaba precio de referencia',
  'Compró por MercadoLibre',
  'Otro motivo',
] as const;

export const quoteItemSchema = z.object({
  id: z.number().int().positive().optional(),
  productId: z.number().int().positive().nullish(),
  sku: z.string().trim().max(64).nullish(),
  description: z.string().trim().min(1, 'La descripción es obligatoria').max(250),
  brand: z.string().trim().max(80).nullish(),
  unitPriceCents: z.number().int().min(0, 'El precio no puede ser negativo'),
  quantity: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
  discountPct: z.number().min(0).max(100).default(0),
  availability: z.enum(['in_stock', 'to_order', 'confirm_lead_time']).default('in_stock'),
});
export type QuoteItemInput = z.infer<typeof quoteItemSchema>;

export const quoteCreateSchema = z.object({
  customerId: z.number().int().positive().nullish(),
  customerName: z.string().trim().min(1, 'El nombre del cliente o empresa es obligatorio').max(120),
  customerPhone: z.string().trim().max(30).nullish(),
  customerCuit: z.string().trim().max(20).nullish(),
  customerEmail: z.string().trim().email('Email inválido').max(120).nullish().or(z.literal('')),
  customerType: z.enum(['particular', 'empresa']).default('particular'),

  // Vehículo
  vehicleBrand: z.string().trim().max(60).nullish(),
  vehicleModel: z.string().trim().max(60).nullish(),
  vehicleYear: z.number().int().min(1950).max(2050).nullish(),
  vehicleEngine: z.string().trim().max(40).nullish(),
  vehiclePlate: z.string().trim().max(20).nullish(),

  // Condiciones comerciales y seguimiento
  validDays: z.number().int().min(1).max(90).default(5),
  includesTax: z.boolean().default(true),
  paymentTerms: z
    .string()
    .trim()
    .max(200)
    .default('Efectivo/Transferencia (dto.) - Tarjetas débito/crédito'),
  notes: z.string().trim().max(1000).nullish(),
  sellerNumber: z.string().trim().max(30).nullish(),
  trackingNumber: z.string().trim().max(40).nullish(),
  followUpStatus: z.enum(['pending', 'following', 'accredited', 'not_viable']).optional(),
  lossReason: z.string().trim().max(200).nullish(),
  followUpNotes: z.string().trim().max(1000).nullish(),

  items: z.array(quoteItemSchema).min(1, 'Debés agregar al menos un repuesto al presupuesto'),
});
export type QuoteCreateInput = z.infer<typeof quoteCreateSchema>;

export const quoteUpdateSchema = quoteCreateSchema.extend({
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted']).optional(),
});
export type QuoteUpdateInput = z.infer<typeof quoteUpdateSchema>;

export const quoteFollowUpUpdateSchema = z.object({
  sellerNumber: z.string().trim().max(30).nullish(),
  trackingNumber: z.string().trim().max(40).nullish(),
  followUpStatus: z.enum(['pending', 'following', 'accredited', 'not_viable']),
  lossReason: z.string().trim().max(200).nullish(),
  followUpNotes: z.string().trim().max(1000).nullish(),
});
export type QuoteFollowUpUpdateInput = z.infer<typeof quoteFollowUpUpdateSchema>;

export const quoteListQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(['all', 'draft', 'sent', 'accepted', 'rejected', 'expired', 'converted']).default('all'),
  followUpStatus: z.enum(['all', 'pending', 'following', 'accredited', 'not_viable']).default('all'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;

export interface QuoteItemDetail {
  id: number;
  quoteId: number;
  productId: number | null;
  sku: string | null;
  description: string;
  brand: string | null;
  unitPriceCents: number;
  quantity: number;
  discountPct: number;
  lineTotalCents: number;
  availability: ItemAvailability;
  sortOrder: number;
}

export interface QuoteDetail {
  id: number;
  quoteNumber: string;
  userId: number;
  userName: string;
  customerId?: number | null;
  customerName: string;
  customerPhone: string | null;
  customerCuit: string | null;
  customerEmail: string | null;
  customerType: CustomerType;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleEngine: string | null;
  vehiclePlate: string | null;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  includesTax: boolean;
  validDays: number;
  validUntil: string;
  isExpired: boolean;
  paymentTerms: string;
  notes: string | null;
  sellerNumber: string | null;
  trackingNumber: string | null;
  followUpStatus: FollowUpStatus;
  lossReason: string | null;
  followUpNotes: string | null;
  status: QuoteStatus;
  convertedSaleId: number | null;
  createdAt: string;
  updatedAt: string;
  items: QuoteItemDetail[];
}

export function formatQuoteNumber(id: number): string {
  return `COT-${String(id).padStart(5, '0')}`;
}

/**
 * Normaliza números de teléfono para generar URLs de WhatsApp (formato internacional +54 9 ...).
 * Maneja códigos de Bariloche (294), Neuquén (299), Buenos Aires (11) y cualquier provincia.
 */
export function formatWhatsAppPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return '';

  // Si ya tiene código de país 54
  if (cleaned.startsWith('54')) {
    if (!cleaned.startsWith('549')) {
      cleaned = '549' + cleaned.slice(2);
    }
    return cleaned;
  }

  // Quitar 0 inicial de código de área si lo tiene (ej: 0294 -> 294)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }

  // Quitar 15 si está antes del número local (ej: 294 15 4629707 -> 294 4629707)
  // En números argentinos de 10 dígitos, si el dígito 4 y 5 son 15 (ej: 294154629707 -> 12 dígitos)
  if (cleaned.length === 12 && cleaned.slice(3, 5) === '15') {
    cleaned = cleaned.slice(0, 3) + cleaned.slice(5);
  } else if (cleaned.length === 11 && cleaned.slice(2, 4) === '15') {
    cleaned = cleaned.slice(0, 2) + cleaned.slice(4);
  }

  return `549${cleaned}`;
}

/**
 * Construye el mensaje con formato profesional para enviar por WhatsApp al cliente.
 */
export function buildWhatsAppQuoteMessage(quote: QuoteDetail): string {
  const vehicleParts: string[] = [];
  if (quote.vehicleBrand || quote.vehicleModel) {
    vehicleParts.push(`${quote.vehicleBrand || ''} ${quote.vehicleModel || ''}`.trim());
  }
  if (quote.vehicleYear) vehicleParts.push(`Año ${quote.vehicleYear}`);
  if (quote.vehicleEngine) vehicleParts.push(quote.vehicleEngine);
  if (quote.vehiclePlate) vehicleParts.push(`(Patente: ${quote.vehiclePlate.toUpperCase()})`);

  const vehicleLine = vehicleParts.length > 0 ? `🚗 *Vehículo:* ${vehicleParts.join(' ')}\n` : '';

  const itemsList = quote.items
    .map((it) => {
      const brandStr = it.brand ? ` [${it.brand}]` : '';
      const availStr = it.availability === 'in_stock' ? '✅ En stock' : it.availability === 'to_order' ? '⏱️ A pedido 24/48hs' : '📞 A confirmar';
      return `• *${it.quantity}x* ${it.description}${brandStr} - ${formatARS(it.lineTotalCents)} _(${availStr})_`;
    })
    .join('\n');

  const taxNote = quote.includesTax ? ' (IVA incluido)' : ' (+ IVA 21%)';
  const segNum = quote.trackingNumber || quote.quoteNumber.replace('COT-', 'SEG-');

  return `Hola *${quote.customerName}*, te enviamos el comprobante interno de tu presupuesto en *Rodamientos Hugo*:

🧾 *Comprobante Interno de Presupuesto N° ${quote.quoteNumber}*
🔖 *Seguimiento:* ${segNum}
${vehicleLine}👤 *Asesor:* ${quote.userName}
📅 *Fecha:* ${quote.createdAt.slice(0, 10)} (Validez: ${quote.validDays} días corridos · hasta ${quote.validUntil})

📦 *Detalle de repuestos cotizados:*
${itemsList}

💰 *Total final:* *${formatARS(quote.totalCents)}*${taxNote}
💳 *Condición de pago:* ${quote.paymentTerms}

📍 *Rodamientos Hugo* | Fagnano 1065, San Carlos de Bariloche
📞 Tel / WhatsApp: (294) 462-9707 · rodamientoshugo@gmail.com
${quote.notes ? `\n📌 _Observaciones: ${quote.notes}_\n` : ''}
Avisanos por este medio para reservarte los repuestos y coordinar el retiro en mostrador.`.trim();
}

export function buildEmailQuoteSubject(quote: QuoteDetail): string {
  const veh = [quote.vehicleBrand, quote.vehicleModel, quote.vehiclePlate]
    .filter(Boolean)
    .join(' ');
  return `Comprobante de Presupuesto ${quote.quoteNumber}${veh ? ` - ${veh}` : ''} | Rodamientos Hugo`;
}

export function buildEmailQuoteBody(quote: QuoteDetail): string {
  const segNum = quote.trackingNumber || quote.quoteNumber.replace('COT-', 'SEG-');
  const vehicleParts = [
    quote.vehicleBrand,
    quote.vehicleModel,
    quote.vehicleYear ? `Año ${quote.vehicleYear}` : null,
    quote.vehicleEngine ? `Motor ${quote.vehicleEngine}` : null,
    quote.vehiclePlate ? `Patente ${quote.vehiclePlate.toUpperCase()}` : null,
  ].filter(Boolean);

  const lines = quote.items.map((it, idx) => {
    const brandStr = it.brand ? ` (${it.brand})` : '';
    const skuStr = it.sku ? `[${it.sku}] ` : '';
    const availStr =
      it.availability === 'in_stock'
        ? 'En stock'
        : it.availability === 'to_order'
        ? 'A pedido 24/48hs'
        : 'A confirmar';
    return `${idx + 1}. ${it.quantity} x ${skuStr}${it.description}${brandStr} — Unit: ${formatARS(it.unitPriceCents)} — Subtotal: ${formatARS(it.lineTotalCents)} (${availStr})`;
  });

  const taxNote = quote.includesTax ? 'IVA incluido' : '+ IVA 21%';

  return [
    `Hola ${quote.customerName},`,
    '',
    `Adjuntamos el detalle del Comprobante Interno de Presupuesto emitido en Rodamientos Hugo:`,
    '',
    `==========================================================`,
    `COMPROBANTE INTERNO DE PRESUPUESTO: ${quote.quoteNumber}`,
    `N° de Seguimiento: ${segNum}`,
    `Fecha de emisión: ${quote.createdAt.slice(0, 10)} (Válido hasta: ${quote.validUntil})`,
    `Atendido por: ${quote.userName}`,
    vehicleParts.length > 0 ? `Vehículo / Aplicación: ${vehicleParts.join(' · ')}` : null,
    `==========================================================`,
    '',
    `DETALLE DE REPUESTOS:`,
    ...lines,
    '',
    `----------------------------------------------------------`,
    `TOTAL PRESUPUESTADO: ${formatARS(quote.totalCents)} (${taxNote})`,
    `Forma de pago: ${quote.paymentTerms}`,
    quote.notes ? `Observaciones: ${quote.notes}` : null,
    `----------------------------------------------------------`,
    '',
    `Por favor respondé este correo o escribinos al WhatsApp (294) 462-9707 indicando el N° ${quote.quoteNumber} para confirmar la reserva o retiro de los repuestos.`,
    '',
    `Saludos cordiales,`,
    `Rodamientos Hugo / Hugo Repuestos`,
    `Fagnano 1065 - San Carlos de Bariloche, Río Negro`,
    `Tel: (294) 462-9707 | rodamientoshugo@gmail.com`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export function buildMailtoQuoteUrl(quote: QuoteDetail, overrideEmail?: string): string {
  const to = (overrideEmail !== undefined ? overrideEmail : quote.customerEmail || '').trim();
  const subject = encodeURIComponent(buildEmailQuoteSubject(quote));
  const body = encodeURIComponent(buildEmailQuoteBody(quote));
  return `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
}

export function buildGmailComposeQuoteUrl(quote: QuoteDetail, overrideEmail?: string): string {
  const to = (overrideEmail !== undefined ? overrideEmail : quote.customerEmail || '').trim();
  const su = encodeURIComponent(buildEmailQuoteSubject(quote));
  const body = encodeURIComponent(buildEmailQuoteBody(quote));
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${su}&body=${body}`;
}

export function isQuoteExpired(validUntil: string): boolean {
  if (!validUntil) return false;
  const today = new Date().toISOString().slice(0, 10);
  return validUntil < today;
}
