import type { parseSmartSearchQuery } from '../../shared/smartSearch';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

/**
 * Caché liviano en memoria del isolate de Cloudflare Worker para evitar re-escanear
 * cientos de miles de filas en D1 ante lecturas repetidas (Dashboard, Alertas, Metadatos).
 * Se invalida automáticamente ante cualquier operación de escritura en `/api/*`.
 */
export async function getOrComputeCached<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = memoryCache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }
  const value = await compute();
  memoryCache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function invalidateReadCache(prefix?: string): void {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const k of memoryCache.keys()) {
    if (k.startsWith(prefix)) {
      memoryCache.delete(k);
    }
  }
}

/**
 * Convierte un resultado de `parseSmartSearchQuery` en una expresión segura para SQLite FTS5 `MATCH`.
 * Mantiene independencia del orden de palabras, variantes fonéticas y grupos OR de marcas.
 */
export function buildFtsMatchQuery(parsed: ReturnType<typeof parseSmartSearchQuery>): string | null {
  if (!parsed.groups.length) return null;

  const groupExprs: string[] = [];

  for (const grp of parsed.groups) {
    const variantExprs: string[] = [];

    for (const rawVariant of grp.variants) {
      const cleanParts = rawVariant
        .toLowerCase()
        .replace(/"/g, '')
        .split(/[^a-z0-9áéíóúüñ]+/i)
        .map((p) => p.trim())
        .filter((p) => p.length >= 2);

      if (cleanParts.length === 0) continue;

      if (cleanParts.length === 1) {
        variantExprs.push(`"${cleanParts[0]}"*`);
      } else {
        const multiPart = `(${cleanParts.map((p) => `"${p}"*`).join(' AND ')})`;
        const compact = cleanParts.join('');
        variantExprs.push(`(${multiPart} OR "${compact}"*)`);
      }
    }

    if (variantExprs.length > 0) {
      const uniqueVariants = Array.from(new Set(variantExprs));
      groupExprs.push(uniqueVariants.length === 1 ? uniqueVariants[0] : `(${uniqueVariants.join(' OR ')})`);
    }
  }

  if (groupExprs.length === 0) return null;
  return groupExprs.join(' AND ');
}
