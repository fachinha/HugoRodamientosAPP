/**
 * Motor compartido de Búsqueda Inteligente Automotor y de Rodamientos.
 * - Independiente del orden de las palabras (izquierda a derecha o derecha a izquierda).
 * - Ignora comas, espacios extras, puntos, guiones, barras, paréntesis y tildes.
 * - Soporta coincidencia compacta de códigos técnicos (ej: "VKMA 05012" == "VKMA05012", "BA-193" == "BA193").
 * - Expande sinónimos, abreviaturas y variantes fonéticas habituales de mostrador
 *   (ej: "chivilcoi" -> "chivilcoy", "dolzamg" -> "dolz" + "vmg", "ruleman" <-> "rodamiento", "bba" <-> "bomba").
 */

const SPANISH_CONNECTORS = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'un',
  'una',
  'unos',
  'unas',
  'y',
  'e',
  'o',
  'u',
  'en',
  'con',
  'sin',
  'por',
  'para',
  'al',
  'a',
]);

/** Palabras pegadas frecuentes cuando se tipea rápido en mostrador */
const COMPOUND_BRAND_SPLITS: Record<string, string[]> = {
  dolzamg: ['dolz', 'vmg'],
  dolzvmg: ['dolz', 'vmg'],
  vmgdolz: ['vmg', 'dolz'],
  skfdolz: ['skf', 'dolz'],
  skfvmg: ['skf', 'vmg'],
};

/** Variantes fonéticas, errores comunes de tipeo y equivalencias léxicas de repuestos */
const TOKEN_SYNONYMS: Record<string, string[]> = {
  chivilcoi: ['chivilcoy', 'chivilcoi'],
  chivilcoy: ['chivilcoy', 'chivilcoi'],
  chibilcoy: ['chivilcoy'],
  chibilcoi: ['chivilcoy'],
  amg: ['vmg', 'amg'],
  vmg: ['vmg'],
  chebrolet: ['chevrolet'],
  chevro: ['chevrolet', 'chevro'],
  chev: ['chevrolet', 'chev'],
  chevrolet: ['chevrolet', 'chev', 'gm'],
  susuki: ['suzuki', 'susuki'],
  suzuki: ['suzuki', 'susuki'],
  wolkswagen: ['volkswagen', 'vw'],
  volkwagen: ['volkswagen', 'vw'],
  volkswagen: ['volkswagen', 'vw'],
  vw: ['vw', 'volkswagen'],
  peugot: ['peugeot'],
  renaut: ['renault'],
  ruleman: ['ruleman', 'rodamiento'],
  rulemanes: ['ruleman', 'rodamiento', 'rodamientos'],
  rodamiento: ['rodamiento', 'ruleman'],
  rodamientos: ['rodamientos', 'rodamiento', 'ruleman'],
  bba: ['bomba', 'bba'],
  bomba: ['bomba', 'bba', 'b.agua'],
  bombas: ['bomba', 'bombas', 'bba'],
  dist: ['distribucion', 'dist', 'distri'],
  distri: ['distribucion', 'distri', 'dist'],
  distribucion: ['distribucion', 'distri', 'dist'],
  crapodina: ['crapodina', 'embrague'],
  retenes: ['reten', 'retenes'],
  reten: ['reten', 'retenes'],
  correas: ['correa', 'correas'],
  correa: ['correa', 'correas'],
  clasic: ['classic', 'clasic'],
  classic: ['classic', 'clasic'],
  stylo: ['stilo', 'stylo'],
  stilo: ['stilo', 'stylo'],
  alfa: ['alfa'],
};

/**
 * Normaliza un texto quitando tildes y pasando a minúsculas.
 */
export function foldAccentsLower(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Versión compacta alfanumérica sin espacios, comas, puntos, guiones ni barras.
 * Ej: "VKMA 05012-A, (SKF)" -> "vkma05012askf"
 */
export function compactAlnum(input: string): string {
  return foldAccentsLower(input).replace(/[^a-z0-9]+/g, '');
}

export interface ParsedSearchToken {
  /** Token limpio original (sin puntuación ni tildes) */
  raw: string;
  /** Variantes aceptadas para este token (OR entre ellas, AND entre distintos tokens) */
  variants: string[];
  /** Si parece código numérico/alfanumérico técnico (conviene buscar también en texto compacto) */
  isCodeLike: boolean;
}

export interface ParsedSmartQuery {
  original: string;
  normalizedFull: string;
  compactFull: string;
  /** Grupos de tokens que deben cumplirse (sin importar el orden) */
  groups: ParsedSearchToken[];
  /** Lista plana de términos para resaltar coincidencias en UI */
  highlightTerms: string[];
  /** Si la consulta menciona múltiples marcas/opciones de comparación (ej: "dolz vmg y skf") */
  brandOptionGroup: string[];
}

const KNOWN_BRAND_TOKENS = new Set([
  'skf',
  'dolz',
  'vmg',
  'chivilcoy',
  'ina',
  'fag',
  'luk',
  'sachs',
  'gates',
  'dayco',
  'continental',
  'contitech',
  'bosch',
  'taranto',
  'corven',
  'cofap',
  'nakata',
  'trw',
  'raybestos',
  'frasle',
  'mahle',
  'sabo',
  'sav',
  'corteco',
  'dbh',
  'tenup',
  'lucas',
  'schadek',
  'valeo',
  'spicer',
  'etma',
  'timken',
  'ntn',
  'koyo',
  'nsk',
]);

/**
 * Parsea una búsqueda libre separando por espacios, comas, punto y coma, más, etc.
 * Si el usuario escribe conectores ("de", "y", "para"), los ignora salvo que sean lo único escrito.
 * Si el usuario enumera varias marcas en la misma consulta (ej: "bomba de agua dolzamg y skf"),
 * agrupa las marcas como alternativas (OR) para mostrar las opciones de todas esas marcas en vez de exigir que un solo ítem tenga las 3 marcas a la vez.
 */
export function parseSmartSearchQuery(query: string, maxTokens = 8): ParsedSmartQuery {
  const folded = foldAccentsLower(query || '').trim();
  if (!folded) {
    return {
      original: query,
      normalizedFull: '',
      compactFull: '',
      groups: [],
      highlightTerms: [],
      brandOptionGroup: [],
    };
  }

  // Separar por espacios, comas, punto y coma, barras cuando separan palabras, signos "+"
  const rawParts = folded
    .replace(/[,;+|]+/g, ' ')
    .split(/\s+/)
    .map((p) => p.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter(Boolean);

  // Expandir palabras compuestas como "dolzamg" -> ["dolz", "vmg"]
  const expandedParts: string[] = [];
  for (const part of rawParts) {
    const cleanAlnum = part.replace(/[^a-z0-9/.-]/g, '');
    const splitCompound = COMPOUND_BRAND_SPLITS[cleanAlnum.replace(/[^a-z0-9]/g, '')];
    if (splitCompound) {
      expandedParts.push(...splitCompound);
    } else {
      expandedParts.push(cleanAlnum);
    }
  }

  const contentParts = expandedParts.filter((w) => !SPANISH_CONNECTORS.has(w));
  const effectiveParts = (contentParts.length > 0 ? contentParts : expandedParts).slice(0, maxTokens + 2);

  // Detectar si el usuario listó 2 o más marcas para comparar opciones (ej: "bomba agua dolz vmg skf")
  const detectedBrands: string[] = [];
  const nonBrandParts: string[] = [];

  for (const p of effectiveParts) {
    const base = p.replace(/[^a-z0-9]/g, '');
    const syn = TOKEN_SYNONYMS[base];
    const canonicalCandidate = syn ? syn[0] : base;
    if (KNOWN_BRAND_TOKENS.has(canonicalCandidate)) {
      if (!detectedBrands.includes(canonicalCandidate)) {
        detectedBrands.push(canonicalCandidate);
      }
    } else {
      nonBrandParts.push(p);
    }
  }

  const groups: ParsedSearchToken[] = [];
  const highlightSet = new Set<string>();

  // Si hay >= 2 marcas mencionadas junto con un repuesto (ej: "bomba de agua dolz vmg y skf"),
  // las marcas forman UN solo grupo OR para traer las 3 opciones de bomba en simultáneo.
  const partsToProcess = detectedBrands.length >= 2 && nonBrandParts.length > 0 ? nonBrandParts : effectiveParts;

  for (const p of partsToProcess.slice(0, maxTokens)) {
    const compact = p.replace(/[^a-z0-9]/g, '');
    if (!compact) continue;

    const variantSet = new Set<string>();
    variantSet.add(p);
    if (compact !== p) variantSet.add(compact);

    const syns = TOKEN_SYNONYMS[compact] || TOKEN_SYNONYMS[p];
    if (syns) {
      for (const s of syns) variantSet.add(s);
    }

    // Si es un código tipo "vkma05012" o "ba193" o "ch0119", sumar variante con espacio/guion entre letras y números
    const alphaNumSplit = compact.match(/^([a-z]{1,5})(\d{2,7}[a-z0-9]*)$/);
    const isCodeLike = /\d/.test(compact) || compact.length >= 4;
    if (alphaNumSplit) {
      variantSet.add(`${alphaNumSplit[1]} ${alphaNumSplit[2]}`);
      variantSet.add(`${alphaNumSplit[1]}-${alphaNumSplit[2]}`);
    }

    const variants = Array.from(variantSet).filter((v) => v.length > 0);
    for (const v of variants) highlightSet.add(v);

    groups.push({
      raw: p,
      variants,
      isCodeLike: /\d/.test(compact),
    });
  }

  if (detectedBrands.length >= 2 && nonBrandParts.length > 0) {
    const brandVariants = new Set<string>();
    for (const b of detectedBrands) {
      brandVariants.add(b);
      const syns = TOKEN_SYNONYMS[b];
      if (syns) syns.forEach((s) => brandVariants.add(s));
    }
    const bArr = Array.from(brandVariants);
    bArr.forEach((v) => highlightSet.add(v));
    groups.push({
      raw: detectedBrands.join('/'),
      variants: bArr,
      isCodeLike: false,
    });
  }

  return {
    original: query,
    normalizedFull: folded,
    compactFull: compactAlnum(folded),
    groups,
    highlightTerms: Array.from(highlightSet).filter((t) => t.length >= 2),
    brandOptionGroup: detectedBrands,
  };
}

export interface TextSmartMatchResult {
  matched: boolean;
  /** Índice aproximado en el texto normalizado donde ocurre la mejor concentración de términos */
  bestIndex: number;
  /** Puntaje de relevancia (mayor = términos más juntos o coincidencia exacta/en mismo renglón) */
  score: number;
}

/**
 * Evalúa si un texto (ej. página de catálogo PDF o descripción) cumple todos los grupos de palabras
 * SIN IMPORTAR EL ORDEN (izquierda->derecha o derecha->izquierda) ni espacios/comas/guiones.
 */
export function matchTextSmart(rawText: string, parsed: ParsedSmartQuery): TextSmartMatchResult {
  if (!rawText || parsed.groups.length === 0) {
    return { matched: false, bestIndex: -1, score: 0 };
  }

  const normText = foldAccentsLower(rawText);
  // Versión sin signos de puntuación (convierte comas, guiones, barras y puntos en espacios)
  const cleanSpacedText = normText.replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ');
  let compactText: string | null = null;

  const hitPositions: number[] = [];

  for (const grp of parsed.groups) {
    let foundIdx = -1;

    for (const v of grp.variants) {
      const idx1 = normText.indexOf(v);
      if (idx1 !== -1) {
        foundIdx = idx1;
        break;
      }
      const cleanV = v.replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanV) {
        const idx2 = cleanSpacedText.indexOf(cleanV);
        if (idx2 !== -1) {
          foundIdx = Math.min(idx2, normText.length - 1);
          break;
        }
      }
    }

    // Si es un código (ej: "05012" o "vkma05012") y en el texto tenía espacios/guiones ("VKMA 05012" o "31210-05012")
    if (foundIdx === -1 && grp.isCodeLike) {
      if (compactText === null) {
        compactText = normText.replace(/[^a-z0-9]+/g, '');
      }
      for (const v of grp.variants) {
        const cv = v.replace(/[^a-z0-9]+/g, '');
        if (cv.length >= 3 && compactText.includes(cv)) {
          // Aproximar posición buscando los últimos 3-4 caracteres en normText
          const tail = cv.slice(-4);
          const approx = normText.indexOf(tail);
          foundIdx = approx !== -1 ? approx : 0;
          break;
        }
      }
    }

    if (foundIdx === -1) {
      return { matched: false, bestIndex: -1, score: 0 };
    }
    hitPositions.push(foundIdx);
  }

  // Calcular concentración: si todos los tokens aparecen a pocos caracteres de distancia (mismo renglón de tabla PDF),
  // darle mucho mayor puntaje y centrar el snippet ahí.
  const minPos = Math.min(...hitPositions);
  const maxPos = Math.max(...hitPositions);
  const span = Math.max(1, maxPos - minPos);

  let score = 100;
  if (normText.includes(parsed.normalizedFull)) {
    score += 120; // Frase exacta además del match sin orden
  }
  if (span <= 80) {
    score += 90; // En el mismo renglón de catálogo
  } else if (span <= 220) {
    score += 45; // En el mismo bloque/tabla
  } else {
    score += Math.max(0, 20 - Math.floor(span / 200));
  }

  return {
    matched: true,
    bestIndex: minPos,
    score,
  };
}
