/**
 * Fechas y zona horaria. Se almacena todo en UTC; se muestra en hora de Argentina.
 * America/Argentina/Salta es la zona IANA que incluye a Río Negro (Bariloche), UTC−3.
 */
export const APP_TIME_ZONE = 'America/Argentina/Salta';

const dateFmt = new Intl.DateTimeFormat('es-AR', {
  timeZone: APP_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timeFmt = new Intl.DateTimeFormat('es-AR', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** DD/MM/AAAA en hora argentina */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  const p = getParts(d);
  return `${p.day}/${p.month}/${p.year}`;
}

/** DD/MM/AAAA HH:mm en hora argentina */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  const p = getParts(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

interface Parts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

function getParts(d: Date): Parts {
  const out: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(d)) out[part.type] = part.value;
  // Algunos motores devuelven "24" para medianoche con hour12:false
  if (out.hour === '24') out.hour = '00';
  return out as unknown as Parts;
}

/** Desfase (en minutos) de la zona de la app respecto de UTC para un instante dado. */
function tzOffsetMinutes(d: Date): number {
  const p = getParts(d);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - d.getTime()) / 60000);
}

/**
 * Rango [inicio, fin) en UTC (ISO) del día calendario argentino que contiene `now`.
 * Se usa para "ventas de hoy". No asume un desfase fijo: lo calcula con Intl.
 */
export function argentinaDayRangeUtc(now: Date = new Date()): { start: string; end: string; label: string } {
  const p = getParts(now);
  const midnightAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, 0, 0, 0);
  const offset = tzOffsetMinutes(new Date(midnightAsUtc));
  const start = new Date(midnightAsUtc - offset * 60000);
  const nextMidnightAsUtc = midnightAsUtc + 24 * 3600 * 1000;
  const offsetNext = tzOffsetMinutes(new Date(nextMidnightAsUtc));
  const end = new Date(nextMidnightAsUtc - offsetNext * 60000);
  return { start: start.toISOString(), end: end.toISOString(), label: `${p.day}/${p.month}/${p.year}` };
}

/** Timestamp UTC actual en el mismo formato que usa SQLite en la base. */
export function nowIso(): string {
  return new Date().toISOString();
}
