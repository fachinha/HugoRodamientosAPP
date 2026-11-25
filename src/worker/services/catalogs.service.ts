import type { ServiceContext } from '../env';
import type { SupplierCatalogQuery } from '../../shared/schemas';
import { parseSmartSearchQuery } from '../../shared/smartSearch';

export interface SupplierCatalogItem {
  id: number;
  supplierName: string;
  brand: string;
  category: string;
  code: string;
  name: string;
  innerDiameterMm: number | null;
  outerDiameterMm: number | null;
  widthMm: number | null;
  dimensions: string | null;
  application: string | null;
  originalCode: string | null;
  priceCents: number;
  createdAt: string;
}

export interface SupplierCatalogResponse {
  items: SupplierCatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AiCatalogOptionItem {
  source: 'inventory' | 'supplier_catalog';
  productId: number | null;
  skuOrCode: string;
  name: string;
  description: string | null;
  brand: string;
  supplierName: string;
  priceCents: number;
  costCents: number | null;
  stock: number | null;
  dimensions: string | null;
}

export interface AiBrandOptionGroup {
  brand: string;
  suppliers: string[];
  itemsCount: number;
  minPriceCents: number;
  totalStockInStore: number;
  items: AiCatalogOptionItem[];
}

export interface AiSmartCatalogSearchResponse {
  query: string;
  aiModelUsed: string;
  partType: string | null;
  vehicleSummary: string | null;
  equivalentCodes: string[];
  technicalSummary: string;
  brandGroups: AiBrandOptionGroup[];
  items: AiCatalogOptionItem[];
}

const AI_SEARCH_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
];

export class CatalogsService {
  constructor(private ctx: ServiceContext) {}

  async list(filter: SupplierCatalogQuery): Promise<SupplierCatalogResponse> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 30));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];

    if (filter.supplierName && filter.supplierName.trim()) {
      conditions.push('supplier_name LIKE ?');
      params.push(`%${filter.supplierName.trim()}%`);
    }

    if (filter.brand && filter.brand.trim()) {
      conditions.push('brand = ? COLLATE NOCASE');
      params.push(filter.brand.trim());
    }

    if (filter.category && filter.category.trim()) {
      conditions.push('category = ? COLLATE NOCASE');
      params.push(filter.category.trim());
    }

    if (filter.innerDiameter !== undefined && !isNaN(filter.innerDiameter)) {
      conditions.push('abs(inner_diameter_mm - ?) <= 0.2');
      params.push(filter.innerDiameter);
    }

    if (filter.outerDiameter !== undefined && !isNaN(filter.outerDiameter)) {
      conditions.push('abs(outer_diameter_mm - ?) <= 0.2');
      params.push(filter.outerDiameter);
    }

    if (filter.width !== undefined && !isNaN(filter.width)) {
      conditions.push('abs(width_mm - ?) <= 0.2');
      params.push(filter.width);
    }

    // Búsqueda inteligente sin orden de palabras (izquierda<->derecha) e ignorando comas/espacios/guiones
    if (filter.q && filter.q.trim()) {
      const parsed = parseSmartSearchQuery(filter.q, 7);
      for (const grp of parsed.groups) {
        const orClauses: string[] = [];
        for (const variant of grp.variants) {
          const like = `%${variant}%`;
          orClauses.push(
            'code LIKE ?',
            'name LIKE ?',
            'brand LIKE ?',
            'supplier_name LIKE ?',
            'application LIKE ?',
            'original_code LIKE ?',
            'dimensions LIKE ?',
          );
          params.push(like, like, like, like, like, like, like);

          if (grp.isCodeLike) {
            const compactVar = variant.replace(/[^a-z0-9]/gi, '');
            if (compactVar.length >= 3) {
              const compactLike = `%${compactVar}%`;
              orClauses.push(
                "REPLACE(REPLACE(REPLACE(REPLACE(code, ' ', ''), '-', ''), '.', ''), '/', '') LIKE ?",
                "REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(original_code, ''), ' ', ''), '-', ''), '.', ''), '/', '') LIKE ?",
              );
              params.push(compactLike, compactLike);
            }
          }
        }
        if (orClauses.length > 0) {
          conditions.push(`(${orClauses.join(' OR ')})`);
        }
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await this.ctx.db
      .prepare(`SELECT COUNT(*) AS total FROM supplier_catalog_items ${where}`)
      .bind(...params)
      .first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const querySql = `
      SELECT id, supplier_name, brand, category, code, name,
             inner_diameter_mm, outer_diameter_mm, width_mm, dimensions,
             application, original_code, price_cents, created_at
      FROM supplier_catalog_items
      ${where}
      ORDER BY CASE WHEN price_cents > 0 THEN 0 ELSE 1 END, brand ASC, code ASC, id ASC
      LIMIT ? OFFSET ?
    `;

    const { results } = await this.ctx.db
      .prepare(querySql)
      .bind(...params, pageSize, offset)
      .all<any>();

    const items: SupplierCatalogItem[] = results.map((r) => ({
      id: r.id,
      supplierName: r.supplier_name,
      brand: r.brand,
      category: r.category,
      code: r.code,
      name: r.name,
      innerDiameterMm: r.inner_diameter_mm ?? null,
      outerDiameterMm: r.outer_diameter_mm ?? null,
      widthMm: r.width_mm ?? null,
      dimensions: r.dimensions ?? null,
      application: r.application ?? null,
      originalCode: r.original_code ?? null,
      priceCents: r.price_cents ?? 0,
      createdAt: r.created_at,
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async getMetadata(): Promise<{
    suppliers: string[];
    brands: string[];
    categories: string[];
    totalItems: number;
  }> {
    const [totalRow, suppliersRes, brandsRes, categoriesRes] = await Promise.all([
      this.ctx.db
        .prepare('SELECT COUNT(*) AS total FROM supplier_catalog_items')
        .first<{ total: number }>(),
      this.ctx.db
        .prepare('SELECT DISTINCT supplier_name FROM supplier_catalog_items WHERE supplier_name IS NOT NULL ORDER BY supplier_name ASC')
        .all<{ supplier_name: string }>(),
      this.ctx.db
        .prepare('SELECT DISTINCT brand FROM supplier_catalog_items WHERE brand IS NOT NULL ORDER BY brand ASC')
        .all<{ brand: string }>(),
      this.ctx.db
        .prepare('SELECT DISTINCT category FROM supplier_catalog_items WHERE category IS NOT NULL ORDER BY category ASC')
        .all<{ category: string }>(),
    ]);

    return {
      suppliers: suppliersRes.results.map((s) => s.supplier_name),
      brands: brandsRes.results.map((b) => b.brand),
      categories: categoriesRes.results.map((c) => c.category),
      totalItems: totalRow?.total ?? 0,
    };
  }

  /**
   * Búsqueda Inteligente con IA y Cruce de Equivalencias dentro del sistema:
   * - Traduce cualquier búsqueda libre (sin importar orden, espacios, comas o faltas de ortografía)
   *   a sus códigos equivalentes multimarca (ej: DOLZ O106 / VMG BA193 / SKF VKPC85206 / CHIVILCOY CH0119).
   * - Busca en inventario propio (`products`) y en listas de proveedores (`supplier_catalog_items`).
   * - Agrupa las opciones encontradas por Marca para ver de un vistazo las opciones disponibles (ej. DOLZ, VMG, SKF, CHIVILCOY en Alfa).
   */
  async aiSmartSearch(rawQuery: string): Promise<AiSmartCatalogSearchResponse> {
    const query = (rawQuery || '').trim();
    const parsed = parseSmartSearchQuery(query, 8);
    if (!query || parsed.groups.length === 0) {
      return {
        query,
        aiModelUsed: 'local-smart-engine',
        partType: null,
        vehicleSummary: null,
        equivalentCodes: [],
        technicalSummary: 'Ingresá un repuesto, código o modelo de vehículo para cruzar equivalencias.',
        brandGroups: [],
        items: [],
      };
    }

    // 1. Intentar expansión técnica con Gemini 2.5 Flash-Lite / Flash (rápido y económico)
    let aiModelUsed = 'motor-tecnico-local';
    let partType: string | null = null;
    let vehicleSummary: string | null = null;
    let equivalentCodes: string[] = [];
    let technicalSummary = '';

    const localExpansion = this.expandKnownCrossCodesLocally(parsed.normalizedFull);
    equivalentCodes.push(...localExpansion.codes);
    partType = localExpansion.partType;
    vehicleSummary = localExpansion.vehicleSummary;

    if (this.ctx.geminiApiKey && this.ctx.geminiApiKey !== 'tu-gemini-api-key-aqui') {
      const models = this.ctx.geminiModel
        ? [this.ctx.geminiModel, ...AI_SEARCH_MODELS.filter((m) => m !== this.ctx.geminiModel)]
        : AI_SEARCH_MODELS;

      const prompt = `Sos un catalogador técnico experto en repuestos automotores y rodamientos en Argentina (trabajando con catálogos SKF, DOLZ, VMG, Bombas Chivilcoy de Alfa Rodamientos, INA, FAG, LuK, Sachs, Gates, Dayco, Continental, Bosch, Taranto, Corteco, SAV, DBH).
Analizá esta búsqueda de mostrador (puede tener palabras desordenadas, pegadas como "dolzamg" = DOLZ y VMG, o errores como "chivilcoi" = CHIVILCOY):
Consulta: "${query}"

Devolvé estrictamente JSON con:
- partType: tipo de repuesto detectado (ej: "Bomba de Agua Automotor", "Kit de Distribución", "Rulemán / Rodamiento", o null)
- vehicleSummary: vehículo/motor detectado si aplica (ej: "Chevrolet Corsa / Classic / Celta 1.4 - 1.6 8V", o null)
- equivalentCodes: hasta 8 códigos técnicos equivalentes reales en Argentina sin espacios (ej: para bomba agua Corsa 1.6 8V -> ["O106", "BA193", "VKPC85206", "CH0119", "O256", "BA504", "CH4994"]; para kit dist Corsa -> ["VKMA05012", "05012", "CT874", "530063010", "KD021"])
- technicalSummary: breve resumen directo de 1 o 2 oraciones en español argentino explicando qué códigos/marcas equivalen a lo buscado.`;

      for (const m of models) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(this.ctx.geminiApiKey)}`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: 'OBJECT',
                  properties: {
                    partType: { type: 'STRING', nullable: true },
                    vehicleSummary: { type: 'STRING', nullable: true },
                    equivalentCodes: { type: 'ARRAY', items: { type: 'STRING' } },
                    technicalSummary: { type: 'STRING' },
                  },
                  required: ['equivalentCodes', 'technicalSummary'],
                },
              },
            }),
            signal: AbortSignal.timeout(6500),
          });
          if (res.ok) {
            const data: any = await res.json();
            const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (txt) {
              const parsedJson = JSON.parse(txt);
              aiModelUsed = m;
              if (parsedJson.partType) partType = parsedJson.partType;
              if (parsedJson.vehicleSummary) vehicleSummary = parsedJson.vehicleSummary;
              if (Array.isArray(parsedJson.equivalentCodes)) {
                for (const c of parsedJson.equivalentCodes) {
                  const cleanC = String(c || '').trim().toUpperCase();
                  if (cleanC.length >= 3 && !equivalentCodes.includes(cleanC)) {
                    equivalentCodes.push(cleanC);
                  }
                }
              }
              if (parsedJson.technicalSummary) {
                technicalSummary = String(parsedJson.technicalSummary).trim();
              }
              break;
            }
          }
        } catch {
          // Seguir con siguiente modelo o motor local
        }
      }
    }

    equivalentCodes = Array.from(new Set(equivalentCodes)).slice(0, 10);

    // 2. Construir consulta híbrida en D1 sobre `products` (sin importar orden de palabras + códigos equivalentes)
    const tokenGroupClauses: string[] = [];
    const tokenParams: any[] = [];

    for (const grp of parsed.groups) {
      const subOr: string[] = [];
      for (const v of grp.variants) {
        const lk = `%${v}%`;
        subOr.push(
          'p.sku LIKE ?',
          'p.name LIKE ?',
          'p.description LIKE ?',
          'p.brand LIKE ?',
          'p.supplier_name LIKE ?',
          'p.supplier_code LIKE ?',
          'p.dimensions LIKE ?',
        );
        tokenParams.push(lk, lk, lk, lk, lk, lk, lk);
        if (grp.isCodeLike) {
          const cv = v.replace(/[^a-z0-9]/gi, '');
          if (cv.length >= 3) {
            subOr.push("REPLACE(REPLACE(REPLACE(p.name, ' ', ''), '-', ''), '/', '') LIKE ?");
            tokenParams.push(`%${cv}%`);
          }
        }
      }
      if (subOr.length > 0) {
        tokenGroupClauses.push(`(${subOr.join(' OR ')})`);
      }
    }

    const mainBranches: string[] = [];
    const allParams: any[] = [];

    if (tokenGroupClauses.length > 0) {
      mainBranches.push(`(${tokenGroupClauses.join(' AND ')})`);
      allParams.push(...tokenParams);
    }

    if (equivalentCodes.length > 0) {
      const eqOr: string[] = [];
      for (const code of equivalentCodes) {
        const cleanCode = code.replace(/[^A-Z0-9]/gi, '');
        if (cleanCode.length < 3) continue;
        eqOr.push(
          'p.sku LIKE ?',
          'p.supplier_code LIKE ?',
          "REPLACE(REPLACE(REPLACE(p.name, ' ', ''), '-', ''), '/', '') LIKE ?",
          'p.description LIKE ?',
        );
        allParams.push(`%${code}%`, `%${code}%`, `%${cleanCode}%`, `%${code}%`);
      }
      if (eqOr.length > 0) {
        if (parsed.brandOptionGroup.length > 0) {
          const bOr = parsed.brandOptionGroup.map(() => 'p.brand LIKE ?').join(' OR ');
          mainBranches.push(`((${eqOr.join(' OR ')}) AND (${bOr}))`);
          for (const b of parsed.brandOptionGroup) allParams.push(`%${b}%`);
        } else {
          mainBranches.push(`(${eqOr.join(' OR ')})`);
        }
      }
    }

    const isAdmin = this.ctx.user.role === 'admin';
    const prodSql = `
      SELECT p.id, p.sku, p.name, p.description, p.brand, p.supplier_name,
             p.price_cents, p.cost_cents, p.stock, p.dimensions
      FROM products p
      WHERE p.active = 1 AND (${mainBranches.join(' OR ')})
      ORDER BY p.stock DESC, CASE WHEN p.price_cents > 0 THEN 0 ELSE 1 END, p.id ASC
      LIMIT 60
    `;

    const prodRes = await this.ctx.db.prepare(prodSql).bind(...allParams).all<any>();
    const combinedItems: AiCatalogOptionItem[] = (prodRes.results || []).map((r) => ({
      source: 'inventory',
      productId: r.id,
      skuOrCode: r.sku,
      name: r.name,
      description: r.description ?? null,
      brand: (r.brand || 'GENÉRICO').toUpperCase(),
      supplierName: r.supplier_name || 'Stock Local',
      priceCents: r.price_cents ?? 0,
      costCents: isAdmin ? (r.cost_cents ?? null) : null,
      stock: r.stock ?? 0,
      dimensions: r.dimensions ?? null,
    }));

    // Si hay pocos resultados en `products`, complementar con `supplier_catalog_items`
    if (combinedItems.length < 20) {
      const catList = await this.list({ q: query, page: 1, pageSize: 25 });
      const seenKeys = new Set(combinedItems.map((i) => `${i.brand}:${i.skuOrCode.replace(/[^A-Z0-9]/gi, '')}`));
      for (const ci of catList.items) {
        const k = `${(ci.brand || '').toUpperCase()}:${ci.code.replace(/[^A-Z0-9]/gi, '')}`;
        if (!seenKeys.has(k)) {
          seenKeys.add(k);
          combinedItems.push({
            source: 'supplier_catalog',
            productId: null,
            skuOrCode: ci.code,
            name: ci.name,
            description: ci.application,
            brand: (ci.brand || 'ESTÁNDAR').toUpperCase(),
            supplierName: ci.supplierName,
            priceCents: ci.priceCents,
            costCents: null,
            stock: null,
            dimensions: ci.dimensions,
          });
        }
      }
    }

    // 3. Agrupar por Marca para mostrar claramente las opciones (ej. DOLZ, VMG, SKF, CHIVILCOY)
    const groupMap = new Map<string, AiBrandOptionGroup>();
    for (const item of combinedItems) {
      const bKey = item.brand || 'OTRAS MARCAS';
      let grp = groupMap.get(bKey);
      if (!grp) {
        grp = {
          brand: bKey,
          suppliers: [],
          itemsCount: 0,
          minPriceCents: item.priceCents > 0 ? item.priceCents : 0,
          totalStockInStore: 0,
          items: [],
        };
        groupMap.set(bKey, grp);
      }
      grp.itemsCount += 1;
      if (item.supplierName && !grp.suppliers.includes(item.supplierName)) {
        grp.suppliers.push(item.supplierName);
      }
      if (item.priceCents > 0 && (grp.minPriceCents === 0 || item.priceCents < grp.minPriceCents)) {
        grp.minPriceCents = item.priceCents;
      }
      if (item.stock && item.stock > 0) {
        grp.totalStockInStore += item.stock;
      }
      if (grp.items.length < 8) {
        grp.items.push(item);
      }
    }

    const priorityBrands = ['SKF', 'DOLZ', 'VMG', 'CHIVILCOY', 'INA', 'FAG', 'GATES', 'DAYCO', 'CONTINENTAL', 'BOSCH', 'LUK', 'SACHS', 'TARANTO', 'SAV', 'CORTECO', 'DBH'];
    const brandGroups = Array.from(groupMap.values()).sort((a, b) => {
      if (b.totalStockInStore !== a.totalStockInStore) return b.totalStockInStore - a.totalStockInStore;
      const idxA = priorityBrands.indexOf(a.brand);
      const idxB = priorityBrands.indexOf(b.brand);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return b.itemsCount - a.itemsCount;
    });

    if (!technicalSummary) {
      if (brandGroups.length > 0) {
        const topBrands = brandGroups.slice(0, 5).map((g) => `${g.brand} (${g.suppliers.join(', ')})`).join(' · ');
        technicalSummary = `Se encontraron ${combinedItems.length} artículo(s) compatibles sin importar el orden de las palabras, distribuidos en ${brandGroups.length} marca(s): ${topBrands}.`;
      } else {
        technicalSummary = `No se hallaron coincidencias exactas para "${query}". Probá con otra medida, modelo o código parcial.`;
      }
    }

    return {
      query,
      aiModelUsed,
      partType,
      vehicleSummary,
      equivalentCodes,
      technicalSummary,
      brandGroups,
      items: combinedItems,
    };
  }

  private expandKnownCrossCodesLocally(normQ: string): {
    codes: string[];
    partType: string | null;
    vehicleSummary: string | null;
  } {
    const codes: string[] = [];
    let partType: string | null = null;
    let vehicleSummary: string | null = null;

    const isWaterPump = normQ.includes('bomba') && (normQ.includes('agua') || normQ.includes('dolz') || normQ.includes('vmg') || normQ.includes('chivil'));
    const isDistKit = normQ.includes('distrib') || normQ.includes('05012') || normQ.includes('vkma');

    if (isWaterPump) {
      partType = 'Bomba de Agua Automotor';
      if (normQ.includes('corsa') || normQ.includes('classic') || normQ.includes('celta') || normQ.includes('agile')) {
        vehicleSummary = 'Chevrolet Corsa / Classic / Celta / Agile / Meriva';
        codes.push('O106', 'BA193', 'BA-193', 'VKPC85206', 'CH0119', 'O256', 'BA504', 'CH4994', 'O262', 'BA473', 'CH2262');
      }
    } else if (isDistKit) {
      partType = 'Kit de Distribución Automotor';
      if (normQ.includes('corsa') || normQ.includes('05012')) {
        vehicleSummary = 'Chevrolet Corsa / Corsa II / Meriva / Fiat Palio / Siena / Idea 1.4 1.6 1.8 8V';
        codes.push('VKMA05012', 'VKMC05012', '05012', 'CT874', '530063010', 'KD021', 'KD232', 'KD234');
      }
    }

    return { codes, partType, vehicleSummary };
  }
}
