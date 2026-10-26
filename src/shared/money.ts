/**
 * Utilidades de dinero. Todos los importes se manejan en centavos (enteros).
 */

const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('es-AR');

/** Formatea centavos como pesos argentinos: 123456 -> "$ 1.234,56" */
export function formatARS(cents: number): string {
  return arsFormatter.format(cents / 100);
}

/** Formatea un número entero con separadores de miles en español: 12345 -> "12.345" */
export function formatNumber(n: number): string {
  return numberFormatter.format(n);
}

/**
 * Convierte un texto de importe a centavos. Acepta formatos argentinos e internacionales:
 * "1.234,56", "1234,56", "1234.56", "$ 1.234", "1234". Devuelve null si es inválido.
 *
 * Regla de desambiguación: si hay coma, la coma es el separador decimal y los puntos son de miles.
 * Si no hay coma y hay un único punto seguido de 1 o 2 dígitos, el punto es decimal.
 * En cualquier otro caso los puntos se consideran separadores de miles.
 */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    return Math.round(input * 100);
  }
  let s = input.trim().replace(/\$/g, '').replace(/\s/g, '');
  if (s === '') return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    // punto decimal
  } else {
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [intPart, decPart = ''] = s.split('.');
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Centavos -> texto editable en formato argentino sin símbolo: 123456 -> "1234,56" */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}
