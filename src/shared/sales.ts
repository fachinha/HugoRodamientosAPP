/**
 * Cálculos de venta compartidos. El servidor los usa como fuente de verdad.
 */

export interface PricedLine {
  unitPriceCents: number;
  quantity: number;
}

export function lineTotal(line: PricedLine): number {
  return line.unitPriceCents * line.quantity;
}

export function subtotal(lines: PricedLine[]): number {
  return lines.reduce((acc, l) => acc + lineTotal(l), 0);
}

/** Descuento en centavos a partir de un porcentaje (redondeo al centavo). */
export function discountFromPct(subtotalCents: number, pct: number): number {
  if (pct <= 0) return 0;
  return Math.min(subtotalCents, Math.round((subtotalCents * pct) / 100));
}

/** Porcentaje efectivo de un descuento sobre un subtotal (0 si el subtotal es 0). */
export function discountPct(subtotalCents: number, discountCents: number): number {
  if (subtotalCents <= 0) return 0;
  return (discountCents / subtotalCents) * 100;
}

/**
 * Importe a reintegrar por una devolución parcial cuando la venta tuvo descuento global:
 * se prorratea el descuento proporcionalmente al valor de lo devuelto.
 * Nunca supera lo pendiente de reintegrar.
 */
export function refundAmount(params: {
  returnedLinesValueCents: number;
  saleSubtotalCents: number;
  saleTotalCents: number;
  alreadyRefundedCents: number;
}): number {
  const { returnedLinesValueCents, saleSubtotalCents, saleTotalCents, alreadyRefundedCents } = params;
  if (saleSubtotalCents <= 0) return 0;
  const raw = Math.round((returnedLinesValueCents * saleTotalCents) / saleSubtotalCents);
  return Math.max(0, Math.min(raw, saleTotalCents - alreadyRefundedCents));
}

export function formatSaleNumber(id: number): string {
  return `V-${String(id).padStart(6, '0')}`;
}
