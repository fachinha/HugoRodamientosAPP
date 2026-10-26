/**
 * Normalización de códigos de barras / SKU leídos por lector HID o escritos a mano.
 * Siempre se tratan como texto: se preservan ceros iniciales.
 */
export function normalizeCode(raw: string): string {
  // Elimina caracteres de control (p. ej. \r, \n, \t, prefijos/sufijos del lector) y espacios en los extremos.
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

export const CODE_PATTERN = /^[\x20-\x7E]{1,64}$/;

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}
