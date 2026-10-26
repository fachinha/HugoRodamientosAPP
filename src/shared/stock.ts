/**
 * Reglas de estado de stock y reposición sugerida. Funciones puras, compartidas
 * por la API (cálculo autoritativo) y la interfaz (presentación).
 */

export type StockStatus = 'out' | 'low' | 'ok' | 'no_min';

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  out: 'Agotado',
  low: 'Stock bajo',
  ok: 'Normal',
  no_min: 'Mínimo sin definir',
};

/**
 * - Agotado: stock = 0 (siempre, aunque no haya mínimo definido).
 * - Stock bajo: 0 < stock <= mínimo.
 * - Normal: stock > mínimo.
 * - Mínimo sin definir: stock > 0 y min_stock = NULL (se señala para que el usuario lo configure).
 */
export function stockStatus(stock: number, minStock: number | null): StockStatus {
  if (stock <= 0) return 'out';
  if (minStock === null || minStock === undefined) return 'no_min';
  if (stock <= minStock) return 'low';
  return 'ok';
}

export interface ReplenishmentSuggestion {
  quantity: number;
  basis: 'target' | 'min_fallback' | 'none';
  explanation: string;
}

/**
 * Cantidad sugerida = stock objetivo − stock actual.
 * Si no hay objetivo, se usa (mínimo × factor) como referencia básica.
 * Si no hay mínimo ni objetivo, no se sugiere ninguna cantidad (no se inventan datos).
 */
export function suggestReplenishment(
  stock: number,
  minStock: number | null,
  targetStock: number | null,
  fallbackFactor = 2,
): ReplenishmentSuggestion {
  if (targetStock !== null && targetStock !== undefined) {
    const q = Math.max(targetStock - stock, 0);
    return { quantity: q, basis: 'target', explanation: `Objetivo ${targetStock} − stock actual ${stock}` };
  }
  if (minStock !== null && minStock !== undefined) {
    const factor = Number.isFinite(fallbackFactor) && fallbackFactor >= 1 ? fallbackFactor : 2;
    const ref = Math.ceil(minStock * factor);
    const q = Math.max(ref - stock, 0);
    return {
      quantity: q,
      basis: 'min_fallback',
      explanation: `Sugerencia básica: mínimo ${minStock} × ${factor} − stock actual ${stock} (sin stock objetivo definido)`,
    };
  }
  return { quantity: 0, basis: 'none', explanation: 'Definí un stock mínimo u objetivo para calcular una sugerencia' };
}

/** Prioridad de reposición: 1 = urgente (agotado), 2 = alta (bajo), 3 = revisar (sin mínimo). */
export function replenishmentPriority(status: StockStatus): 1 | 2 | 3 | null {
  switch (status) {
    case 'out':
      return 1;
    case 'low':
      return 2;
    case 'no_min':
      return 3;
    default:
      return null;
  }
}
