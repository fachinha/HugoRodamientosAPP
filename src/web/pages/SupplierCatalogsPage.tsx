import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  Search,
  Ruler,
  Truck,
  Plus,
  Check,
  Loader2,
  X,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Download,
  FileSearch,
  MapPin,
  Layers,
  Package,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { centsToInput, parseMoneyToCents, formatARS } from '../../shared/money';
import {
  parseSmartSearchQuery,
  matchTextSmart,
  foldAccentsLower,
} from '../../shared/smartSearch';

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

export interface CatalogPageData {
  pageNumber: number;
  text: string;
}

export interface CatalogEntry {
  id: string;
  supplier?: string;
  file: string;
  title: string;
  brand: string;
  category: string;
  totalPages: number;
  pages: CatalogPageData[];
}

interface SearchMatch {
  catalogId: string;
  catalogTitle: string;
  catalogFile: string;
  supplier?: string;
  brand: string;
  category: string;
  pageNumber: number;
  snippet: string;
  score: number;
}

interface AiCatalogOptionItem {
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

interface AiBrandOptionGroup {
  brand: string;
  suppliers: string[];
  itemsCount: number;
  minPriceCents: number;
  totalStockInStore: number;
  items: AiCatalogOptionItem[];
}

interface AiSmartCatalogSearchResponse {
  query: string;
  aiModelUsed: string;
  partType: string | null;
  vehicleSummary: string | null;
  equivalentCodes: string[];
  technicalSummary: string;
  brandGroups: AiBrandOptionGroup[];
  items: AiCatalogOptionItem[];
}

export const SupplierCatalogsPage: React.FC = () => {
  // Tabs: 'pdf' (Visor PDF oficial) | 'ai' (Buscador IA de Equivalencias y Opciones) | 'database' (Tabla y Calibre)
  const [activeTab, setActiveTab] = useState<'pdf' | 'ai' | 'database'>('pdf');

  // Estado del visor PDF y manifiesto
  const [catalogs, setCatalogs] = useState<CatalogEntry[]>([]);
  const [loadingManifest, setLoadingManifest] = useState(true);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('pesaro');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInput, setPageInput] = useState<string>('1');

  // Buscador Ctrl+H en PDFs — por defecto en 'all' para buscar en todos los catálogos sin quedar atrapado en uno solo
  const [pdfSearchQuery, setPdfSearchQuery] = useState<string>('');
  const [searchScope, setSearchScope] = useState<'current' | 'all'>('all');
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Estado del Buscador Inteligente y Cruce de Equivalencias con IA
  const [aiQuery, setAiQuery] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiResult, setAiResult] = useState<AiSmartCatalogSearchResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Estado para la pestaña de Base de Datos y Calibre
  const [items, setItems] = useState<SupplierCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [dbPage, setDbPage] = useState(1);
  const [totalDbPages, setTotalDbPages] = useState(1);
  const [loadingDb, setLoadingDb] = useState(false);

  // Filtros de base de datos
  const [dbQ, setDbQ] = useState('');
  const [dbSupplier, setDbSupplier] = useState('');
  const [dbCategory, setDbCategory] = useState('');
  const [dbBrand, setDbBrand] = useState('');
  const [innerDiameter, setInnerDiameter] = useState('');
  const [outerDiameter, setOuterDiameter] = useState('');
  const [width, setWidth] = useState('');

  // Metadatos para dropdowns de base de datos
  const [suppliersList, setSuppliersList] = useState<string[]>([]);
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [brandsList, setBrandsList] = useState<string[]>([]);

  // Modal para agregar producto al inventario propio
  const [selectedItemForImport, setSelectedItemForImport] = useState<SupplierCatalogItem | null>(null);

  useEffect(() => {
    const loadManifest = async () => {
      try {
        setLoadingManifest(true);
        const res = await fetch('/catalogs/catalogs-manifest.json');
        if (res.ok) {
          const data: CatalogEntry[] = await res.json();
          setCatalogs(data);
          if (data.length > 0 && !selectedCatalogId) {
            setSelectedCatalogId(data[0].id);
          }
        }
      } catch (err) {
        console.error('Error cargando manifiesto de catálogos:', err);
      } finally {
        setLoadingManifest(false);
      }
    };
    loadManifest();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H' || e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setActiveTab('pdf');
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeCatalog = useMemo(() => {
    return catalogs.find((c) => c.id === selectedCatalogId) || catalogs[0];
  }, [catalogs, selectedCatalogId]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const parsedPdfQuery = useMemo(() => parseSmartSearchQuery(pdfSearchQuery, 8), [pdfSearchQuery]);

  // Búsqueda inteligente en tiempo real a través de los PDFs (sin importar el orden de las palabras, espacios ni comas)
  const searchMatches = useMemo<SearchMatch[]>(() => {
    if (!pdfSearchQuery.trim() || parsedPdfQuery.groups.length === 0) return [];
    if (parsedPdfQuery.compactFull.length < 2) return [];

    const results: SearchMatch[] = [];
    const catalogsToScan =
      searchScope === 'current'
        ? activeCatalog
          ? [activeCatalog]
          : []
        : catalogs;

    for (const cat of catalogsToScan) {
      if (!cat.pages) continue;
      for (const p of cat.pages) {
        const rawText = p.text || '';
        const combinedSearchable = `${cat.title} ${cat.brand} ${cat.supplier || ''} ${rawText}`;
        const m = matchTextSmart(combinedSearchable, parsedPdfQuery);
        if (m.matched) {
          // Calcular índice dentro del texto propio de la página para armar el snippet
          const headerLen = `${cat.title} ${cat.brand} ${cat.supplier || ''} `.length;
          const pageMatchIdx = Math.max(0, m.bestIndex - headerLen);
          const start = Math.max(0, pageMatchIdx - 50);
          const end = Math.min(rawText.length, pageMatchIdx + 135);
          const snippetPrefix = start > 0 ? '...' : '';
          const snippetSuffix = end < rawText.length ? '...' : '';
          const snippet =
            snippetPrefix + rawText.slice(start, end).replace(/\s+/g, ' ').trim() + snippetSuffix;

          results.push({
            catalogId: cat.id,
            catalogTitle: cat.title,
            catalogFile: cat.file,
            supplier: cat.supplier,
            brand: cat.brand,
            category: cat.category,
            pageNumber: p.pageNumber,
            snippet,
            score: m.score,
          });
        }
      }
    }

    // Ordenar primero las páginas donde las palabras están juntas en el mismo renglón
    results.sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber);
    return results.slice(0, 250);
  }, [pdfSearchQuery, parsedPdfQuery, searchScope, activeCatalog, catalogs]);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [pdfSearchQuery, searchScope]);

  const jumpToMatch = (match: SearchMatch, index: number) => {
    if (selectedCatalogId !== match.catalogId) {
      setSelectedCatalogId(match.catalogId);
    }
    setCurrentPage(match.pageNumber);
    setCurrentMatchIndex(index);
  };

  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % searchMatches.length;
    jumpToMatch(searchMatches[nextIdx], nextIdx);
  };

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    jumpToMatch(searchMatches[prevIdx], prevIdx);
  };

  const handlePageJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(pageInput, 10);
    if (!isNaN(p) && activeCatalog) {
      const clamped = Math.max(1, Math.min(activeCatalog.totalPages, p));
      setCurrentPage(clamped);
      setPageInput(String(clamped));
    }
  };

  // Resaltado multi-palabra sin importar el orden ni tildes
  const renderHighlightedSnippet = (snippet: string) => {
    const terms = parsedPdfQuery.highlightTerms;
    if (!terms || terms.length === 0) return snippet;

    const escaped = terms
      .slice()
      .sort((a, b) => b.length - a.length)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(Boolean);

    if (escaped.length === 0) return snippet;
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = snippet.split(regex);
    const termSet = new Set(terms.map((t) => foldAccentsLower(t)));

    return (
      <span>
        {parts.map((part, i) =>
          termSet.has(foldAccentsLower(part)) ? (
            <mark key={i} className="bg-amber-300 text-slate-900 font-bold px-0.5 rounded">
              {part}
            </mark>
          ) : (
            part
          ),
        )}
      </span>
    );
  };

  // Token principal para pasar al visor nativo #search= (los visores PDF nativos resaltan 1 término/código)
  const pdfViewerHighlightToken = useMemo(() => {
    if (!pdfSearchQuery.trim()) return '';
    const codeGrp = parsedPdfQuery.groups.find((g) => g.isCodeLike);
    if (codeGrp) return codeGrp.raw;
    return parsedPdfQuery.groups[0]?.raw || pdfSearchQuery.trim();
  }, [pdfSearchQuery, parsedPdfQuery]);

  // Ejecutar búsqueda inteligente con IA dentro del sistema
  const runAiCrossSearch = async (customQuery?: string) => {
    const q = (customQuery !== undefined ? customQuery : aiQuery).trim();
    if (!q) return;
    if (customQuery !== undefined) setAiQuery(q);
    setActiveTab('ai');
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await apiFetch<AiSmartCatalogSearchResponse>('/catalogs/ai-search', {
        method: 'POST',
        body: JSON.stringify({ query: q }),
      });
      setAiResult(res);
    } catch (err: any) {
      setAiError(err.message || 'No se pudo completar el cruce inteligente.');
    } finally {
      setAiLoading(false);
    }
  };

  const fetchDbMetadata = async () => {
    try {
      const res = await apiFetch<any>('/catalogs/metadata');
      setSuppliersList(res.suppliers || []);
      setCategoriesList(res.categories || []);
      setBrandsList(res.brands || []);
    } catch (err) {
      console.error('Error cargando metadatos:', err);
    }
  };

  const fetchDbItems = async (p = dbPage) => {
    setLoadingDb(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: '30',
      });
      if (dbQ.trim()) params.set('q', dbQ.trim());
      if (dbSupplier) params.set('supplierName', dbSupplier);
      if (dbCategory) params.set('category', dbCategory);
      if (dbBrand) params.set('brand', dbBrand);
      if (innerDiameter.trim()) params.set('innerDiameter', innerDiameter.trim());
      if (outerDiameter.trim()) params.set('outerDiameter', outerDiameter.trim());
      if (width.trim()) params.set('width', width.trim());

      const res = await apiFetch<any>(`/catalogs/items?${params.toString()}`);
      setItems(res.items || []);
      setTotal(res.total || 0);
      setDbPage(res.page || 1);
      setTotalDbPages(res.totalPages || 1);
    } catch (err) {
      console.error('Error cargando ítems de catálogo:', err);
    } finally {
      setLoadingDb(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'database') {
      fetchDbMetadata();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'database') {
      fetchDbItems(1);
    }
  }, [activeTab, dbSupplier, dbCategory, dbBrand]);

  const pdfCountLabel = catalogs.length > 0 ? `${catalogs.length} PDFs` : 'PDFs';

  return (
    <div className="space-y-4">
      {/* Encabezado directo sin eyebrow tags */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Catálogos Técnicos y Buscador de Equivalencias
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Buscá palabras en cualquier orden (de izquierda a derecha o al revés, sin importar comas ni espacios) en Alfa Rodamientos, Chivilcoy, Bramco, Icepar, Magnum, Arcore e Iturria.
          </p>
        </div>

        {/* Selector de Pestañas */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('pdf')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all active:scale-96 cursor-pointer ${
              activeTab === 'pdf'
                ? 'bg-white text-blue-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <BookOpen className="h-4 w-4 text-blue-600" />
            <span>Visor PDF (Ctrl+H)</span>
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full">
              {pdfCountLabel}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all active:scale-96 cursor-pointer ${
              activeTab === 'ai'
                ? 'bg-white text-orange-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Sparkles className="h-4 w-4 text-orange-600" />
            <span>Buscador IA y Opciones</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('database')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all active:scale-96 cursor-pointer ${
              activeTab === 'database'
                ? 'bg-white text-blue-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Ruler className="h-4 w-4 text-slate-500" />
            <span>Calibre d×D×B y Listas</span>
            {total > 0 && (
              <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-full">
                {total.toLocaleString('es-AR')}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* PESTAÑA 1: VISOR OFICIAL PDF CON BUSCADOR BIDIRECCIONAL SIN ORDEN */}
      {activeTab === 'pdf' && (
        <div className="space-y-3">
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Selector de Catálogo */}
            <div className="flex items-center gap-2 min-w-0">
              <label className="text-xs font-semibold text-slate-500 shrink-0">Catálogo:</label>
              <select
                value={selectedCatalogId}
                onChange={(e) => {
                  setSelectedCatalogId(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-slate-50 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[250px] truncate"
              >
                {catalogs.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.title} ({cat.totalPages} pág) - {cat.category}
                  </option>
                ))}
              </select>
            </div>

            {/* Buscador sin orden ni comas */}
            <div className="flex-1 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={pdfSearchQuery}
                  onChange={(e) => setPdfSearchQuery(e.target.value)}
                  placeholder="Escribí en cualquier orden: ej. 'Chevrolet corsa 05012' o '05012 corsa'..."
                  className="w-full pl-9 pr-8 py-2 border border-blue-200 bg-blue-50/30 hover:bg-blue-50/50 focus:bg-white rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                />
                {pdfSearchQuery ? (
                  <button
                    type="button"
                    onClick={() => setPdfSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 rounded">
                    Ctrl+H
                  </kbd>
                )}
              </div>

              {/* Alcance: todos los PDFs vs solo el actual */}
              <button
                type="button"
                onClick={() => setSearchScope((prev) => (prev === 'current' ? 'all' : 'current'))}
                className={`px-2.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all active:scale-96 shrink-0 border ${
                  searchScope === 'all'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
                title={searchScope === 'all' ? `Buscando en los ${catalogs.length} catálogos` : 'Buscando solo en este PDF'}
              >
                {searchScope === 'all' ? `En los ${catalogs.length || 33} PDFs` : 'Solo este PDF'}
              </button>

              {/* Saltar directo a Cruce IA con lo escrito */}
              {pdfSearchQuery.trim().length >= 2 && (
                <button
                  type="button"
                  onClick={() => runAiCrossSearch(pdfSearchQuery)}
                  className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs hover:-translate-y-0.5 active:scale-96 transition-all shrink-0"
                  title="Cruzar códigos equivalentes y opciones de marca en todo el sistema con IA"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Cruzar opciones IA</span>
                </button>
              )}

              {searchMatches.length > 0 && (
                <div className="flex items-center gap-1 shrink-0 bg-amber-50 px-2 py-1 rounded-xl border border-amber-200 text-xs text-amber-900 font-medium">
                  <span>
                    {currentMatchIndex + 1}/{searchMatches.length}
                  </span>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={handlePrevMatch}
                      className="p-1 hover:bg-amber-100 rounded cursor-pointer active:scale-96"
                      title="Coincidencia anterior"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextMatch}
                      className="p-1 hover:bg-amber-100 rounded cursor-pointer active:scale-96"
                      title="Siguiente coincidencia"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Controles de Página */}
            <div className="flex items-center gap-2 shrink-0">
              <form onSubmit={handlePageJumpSubmit} className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                <span>Pág.</span>
                <input
                  type="text"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  className="w-12 px-1.5 py-1 text-center font-bold font-mono border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span>de {activeCatalog?.totalPages || 1}</span>
                <button
                  type="submit"
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-slate-700 cursor-pointer active:scale-96 font-semibold"
                >
                  Ir
                </button>
              </form>

              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-2 hover:bg-slate-50 disabled:opacity-40 cursor-pointer text-slate-700"
                  title="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= (activeCatalog?.totalPages || 1)}
                  onClick={() => setCurrentPage((p) => Math.min(activeCatalog?.totalPages || 1, p + 1))}
                  className="p-2 hover:bg-slate-50 disabled:opacity-40 cursor-pointer text-slate-700 border-l border-slate-200"
                  title="Página siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {activeCatalog && (
                <a
                  href={`/catalogs/${activeCatalog.file}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 hover:text-slate-900 cursor-pointer active:scale-96 transition-all"
                  title="Abrir PDF en pestaña nueva"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}

              {activeCatalog && (
                <a
                  href={`/catalogs/${activeCatalog.file}`}
                  download={activeCatalog.file}
                  className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 hover:text-slate-900 cursor-pointer active:scale-96 transition-all"
                  title="Descargar PDF oficial"
                >
                  <Download className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
            <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col h-[760px] overflow-hidden">
              <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-800">
                    {pdfSearchQuery.trim().length >= 2
                      ? `Coincidencias (${searchMatches.length})`
                      : `Catálogos Oficiales (${catalogs.length})`}
                  </span>
                </div>
                {pdfSearchQuery.trim().length >= 2 && (
                  <span className="text-[10px] text-slate-500 font-medium">Click para ir a pág.</span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
                {pdfSearchQuery.trim().length >= 2 ? (
                  searchMatches.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs space-y-3">
                      <Search className="h-8 w-8 mx-auto text-slate-300 stroke-[1.5]" />
                      <p className="font-semibold text-slate-700">
                        Sin coincidencias en los PDFs para "{pdfSearchQuery}"
                      </p>
                      <p className="text-[11px] leading-relaxed">
                        Muchos artículos (como bombas Chivilcoy, VMG, Dolz o listas Excel) están cargados en la base de datos del sistema aunque no tengan PDF impreso.
                      </p>
                      <div className="flex flex-col gap-2 pt-1">
                        {searchScope === 'current' && (
                          <button
                            type="button"
                            onClick={() => setSearchScope('all')}
                            className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold cursor-pointer active:scale-96"
                          >
                            Buscar en los {catalogs.length} PDFs
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => runAiCrossSearch(pdfSearchQuery)}
                          className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer active:scale-96"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Buscar opciones y equivalencias en el sistema</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    searchMatches.map((match, idx) => {
                      const isCurrentMatch =
                        idx === currentMatchIndex &&
                        selectedCatalogId === match.catalogId &&
                        currentPage === match.pageNumber;

                      return (
                        <button
                          key={`${match.catalogId}-${match.pageNumber}-${idx}`}
                          type="button"
                          onClick={() => jumpToMatch(match, idx)}
                          className={`w-full text-left p-3 rounded-xl transition-all cursor-pointer border ${
                            isCurrentMatch
                              ? 'bg-blue-50/90 border-blue-400 shadow-2xs'
                              : 'bg-white hover:bg-slate-50 border-transparent hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-semibold text-xs text-slate-900 truncate">
                              {match.catalogTitle}
                            </span>
                            <span className="shrink-0 px-2 py-0.5 bg-slate-900 text-white rounded font-mono font-bold text-[10px]">
                              Pág. {match.pageNumber}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 line-clamp-3 leading-relaxed font-mono">
                            {renderHighlightedSnippet(match.snippet)}
                          </p>
                        </button>
                      );
                    })
                  )
                ) : (
                  catalogs.map((cat) => {
                    const isSelected = cat.id === selectedCatalogId;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setSelectedCatalogId(cat.id);
                          setCurrentPage(1);
                        }}
                        className={`w-full text-left p-3 rounded-xl transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-blue-50 border-blue-400 shadow-2xs'
                            : 'bg-white hover:bg-slate-50 border-slate-100 hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs text-slate-900 leading-tight">
                            {cat.title}
                          </span>
                          <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {cat.totalPages} pág
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {cat.supplier && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                              {cat.supplier}
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                            {cat.brand}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
                            {cat.category}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="lg:col-span-8 bg-slate-900 rounded-2xl border border-slate-300 shadow-md h-[760px] overflow-hidden flex flex-col">
              {loadingManifest ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                  <p className="text-xs">Cargando visor y documentos oficiales...</p>
                </div>
              ) : activeCatalog ? (
                <iframe
                  key={`${activeCatalog.file}-page-${currentPage}`}
                  src={`/catalogs/${activeCatalog.file}#page=${currentPage}&search=${encodeURIComponent(
                    pdfViewerHighlightToken,
                  )}&zoom=page-width`}
                  className="w-full h-full border-none bg-slate-800"
                  title={activeCatalog.title}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
                  Seleccioná un catálogo para visualizar el documento oficial.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: BUSCADOR INTELIGENTE CON IA Y OPCIONES POR MARCA / PROVEEDOR */}
      {activeTab === 'ai' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Buscador de Equivalencias y Opciones en el Sistema
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Escribí el repuesto, vehículo o marcas en cualquier orden, sin preocuparte por espacios, comas o cómo se escribe (ej. Chivilcoy / Chivilcoi, Dolz, VMG, SKF).
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAiCrossSearch();
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <div className="relative flex-1">
                <Sparkles className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-orange-600" />
                <input
                  type="text"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  placeholder="Ej: bomba de agua corsa dolz vmg skf, chivilcoy en alfa, Chevrolet corsa 05012..."
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-xs font-medium bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <button
                type="submit"
                disabled={aiLoading || !aiQuery.trim()}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer hover:-translate-y-0.5 active:scale-96 transition-all disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span>Buscar y Cruzar Opciones</span>
              </button>
            </form>

            {/* Ejemplos rápidos reales */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-400 font-medium mr-1">Probar ejemplos:</span>
              {[
                'Chevrolet corsa 05012',
                'bomba de agua corsa dolz vmg y skf',
                'bomba agua chivilcoi corsa alfa',
                'kit distribucion palio 1.8',
                'ruleman 6204 skf',
              ].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => runAiCrossSearch(sample)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-orange-50 hover:text-orange-800 hover:border-orange-200 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 cursor-pointer active:scale-96 transition-all"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>

          {aiError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              {aiError}
            </div>
          )}

          {aiLoading && (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
              <span>Cruzando códigos equivalentes, marcas y proveedores en la base de datos...</span>
            </div>
          )}

          {!aiLoading && aiResult && (
            <div className="space-y-4">
              {/* Resumen técnico IA y códigos equivalentes */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-orange-400" />
                    <span>
                      {aiResult.partType || 'Resultado del cruce técnico'}
                      {aiResult.vehicleSummary ? ` — ${aiResult.vehicleSummary}` : ''}
                    </span>
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Motor: {aiResult.aiModelUsed}
                  </span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">{aiResult.technicalSummary}</p>

                {aiResult.equivalentCodes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400 font-semibold">
                      Códigos equivalentes cruzados:
                    </span>
                    {aiResult.equivalentCodes.map((c) => (
                      <span
                        key={c}
                        className="px-2 py-0.5 rounded bg-orange-500/20 border border-orange-400/40 text-orange-200 font-mono text-[11px] font-bold"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Opciones agrupadas por Marca (ej: DOLZ, VMG, SKF, CHIVILCOY) */}
              {aiResult.brandGroups.length === 0 ? (
                <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
                  No se encontraron opciones registradas para "{aiResult.query}".
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {aiResult.brandGroups.map((grp) => (
                    <div
                      key={grp.brand}
                      className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col"
                    >
                      <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Layers className="h-4 w-4 text-orange-600" />
                            <span>Opción {grp.brand}</span>
                          </h4>
                          <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Truck className="h-3 w-3 text-slate-400" />
                            <span>Proveedores: {grp.suppliers.join(' · ')}</span>
                          </p>
                        </div>
                        <div className="text-right">
                          {grp.minPriceCents > 0 && (
                            <span className="block text-xs font-bold text-slate-900">
                              desde {formatARS(grp.minPriceCents)}
                            </span>
                          )}
                          <span
                            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              grp.totalStockInStore > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {grp.totalStockInStore > 0
                              ? `${grp.totalStockInStore} u. en local`
                              : `${grp.itemsCount} en catálogo`}
                          </span>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100 flex-1">
                        {grp.items.map((it, idx) => (
                          <div
                            key={`${it.skuOrCode}-${idx}`}
                            className="p-3 hover:bg-slate-50/80 transition-colors flex items-start justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono font-bold text-slate-900">{it.skuOrCode}</span>
                                <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-800 border border-orange-200 text-[10px] font-semibold">
                                  {it.supplierName}
                                </span>
                                {it.stock !== null && it.stock > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                    Stock: {it.stock}
                                  </span>
                                )}
                              </div>
                              <p className="font-medium text-slate-800 mt-0.5">{it.name}</p>
                              {it.description && it.description !== it.name && (
                                <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                                  {it.description}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-bold text-slate-900 block">
                                {it.priceCents > 0 ? formatARS(it.priceCents) : 'S/P'}
                              </span>
                              {it.costCents !== null && it.costCents > 0 && (
                                <span className="text-[10px] text-slate-400 block">
                                  Costo: {formatARS(it.costCents)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 3: BASE DE DATOS Y BÚSQUEDA POR CALIBRE (d x D x B) */}
      {activeTab === 'database' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white p-5 rounded-2xl shadow-md border border-blue-800">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Ruler className="h-5 w-5 text-blue-400" />
                  <h2 className="text-base font-bold text-white tracking-wide">
                    Buscador por Calibre (Medidas en mm)
                  </h2>
                </div>
                <p className="text-xs text-blue-200 mt-0.5">
                  ¿Un cliente trajo un rodamiento, retén o cruceta de muestra? Medilo con el calibre e ingresá sus dimensiones:
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchDbItems(1);
                }}
                className="flex flex-wrap items-center gap-2.5"
              >
                <div className="flex items-center gap-1.5 bg-blue-950/60 p-1.5 rounded-xl border border-blue-700/60">
                  <div>
                    <label className="block text-[10px] text-blue-300 font-mono text-center">d (Interior)</label>
                    <input
                      type="number"
                      step="any"
                      value={innerDiameter}
                      onChange={(e) => setInnerDiameter(e.target.value)}
                      placeholder="ej: 25"
                      className="w-20 px-2 py-1 text-xs bg-slate-900 border border-blue-600/60 rounded text-center text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                  <span className="text-blue-400 font-bold text-xs mt-3">×</span>
                  <div>
                    <label className="block text-[10px] text-blue-300 font-mono text-center">D (Exterior)</label>
                    <input
                      type="number"
                      step="any"
                      value={outerDiameter}
                      onChange={(e) => setOuterDiameter(e.target.value)}
                      placeholder="ej: 52"
                      className="w-20 px-2 py-1 text-xs bg-slate-900 border border-blue-600/60 rounded text-center text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                  <span className="text-blue-400 font-bold text-xs mt-3">×</span>
                  <div>
                    <label className="block text-[10px] text-blue-300 font-mono text-center">B (Ancho)</label>
                    <input
                      type="number"
                      step="any"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      placeholder="ej: 15"
                      className="w-20 px-2 py-1 text-xs bg-slate-900 border border-blue-600/60 rounded text-center text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mt-2 lg:mt-0">
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-white font-semibold text-xs rounded-xl shadow-xs transition-all active:scale-96 cursor-pointer flex items-center gap-1.5"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>Buscar Calibre</span>
                  </button>
                  {(innerDiameter || outerDiameter || width) && (
                    <button
                      type="button"
                      onClick={() => {
                        setInnerDiameter('');
                        setOuterDiameter('');
                        setWidth('');
                        fetchDbItems(1);
                      }}
                      className="p-2.5 bg-blue-800/80 hover:bg-blue-700 text-blue-200 rounded-xl text-xs cursor-pointer active:scale-96 transition-all"
                      title="Limpiar medidas"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchDbItems(1);
              }}
              className="flex-1 w-full flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={dbQ}
                  onChange={(e) => setDbQ(e.target.value)}
                  placeholder="Buscar palabras en cualquier orden: ej. 'Chevrolet corsa 05012', 'chivilcoy corsa', 'bomba agua'..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg cursor-pointer active:scale-96 transition-all"
              >
                Buscar
              </button>
              {dbQ.trim() && (
                <button
                  type="button"
                  onClick={() => runAiCrossSearch(dbQ)}
                  className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg cursor-pointer active:scale-96 transition-all flex items-center gap-1.5 shrink-0"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Opciones IA</span>
                </button>
              )}
            </form>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <select
                value={dbSupplier}
                onChange={(e) => setDbSupplier(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 font-medium"
              >
                <option value="">Todos los proveedores</option>
                {suppliersList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                value={dbCategory}
                onChange={(e) => setDbCategory(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
              >
                <option value="">Todas las categorías</option>
                {categoriesList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={dbBrand}
                onChange={(e) => setDbBrand(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
              >
                <option value="">Todas las marcas</option>
                {brandsList.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loadingDb ? (
              <div className="p-14 flex items-center justify-center text-slate-400 gap-2 text-xs">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <span>Consultando catálogo de repuestos...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="p-14 text-center text-slate-400 text-xs space-y-2">
                <p className="font-semibold text-slate-600">No se encontraron repuestos con los criterios buscados.</p>
                <p>Probá usando el botón naranja "Opciones IA" para cruzar códigos equivalentes.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Código Proveedor</th>
                      <th className="px-4 py-3">Descripción y Marca</th>
                      <th className="px-4 py-3">Medidas Técnicas</th>
                      <th className="px-4 py-3">Aplicación / Cruzamientos</th>
                      <th className="px-4 py-3 text-right">Precio Ref.</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it) => (
                      <tr key={it.id} className="hover:bg-blue-50/40 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-900 block">{it.code}</span>
                          <span className="text-[10px] text-slate-500 font-medium block">
                            {it.supplierName} {it.originalCode ? `| Ref: ${it.originalCode}` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{it.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              {it.brand}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              {it.category}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {it.dimensions ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded font-mono font-bold text-[11px] bg-blue-50 text-blue-900 border border-blue-200">
                              <Ruler className="h-3 w-3 text-blue-600" />
                              {it.dimensions}
                            </span>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">Ver aplicación</span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-sm">
                          <p className="text-slate-600 line-clamp-2 leading-relaxed">
                            {it.application || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-900">
                          {it.priceCents > 0 ? formatARS(it.priceCents) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedItemForImport(it)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-2xs active:scale-96 transition-all"
                            title="Crear o vincular a mis productos en inventario"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Cargar en stock</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalDbPages > 1 && (
              <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <span>Página {dbPage} de {totalDbPages}</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={dbPage <= 1}
                    onClick={() => {
                      const next = dbPage - 1;
                      setDbPage(next);
                      fetchDbItems(next);
                    }}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer active:scale-96"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={dbPage >= totalDbPages}
                    onClick={() => {
                      const next = dbPage + 1;
                      setDbPage(next);
                      fetchDbItems(next);
                    }}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer active:scale-96"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedItemForImport && (
        <CreateProductFromCatalogModal
          item={selectedItemForImport}
          onClose={() => setSelectedItemForImport(null)}
          onSuccess={() => setSelectedItemForImport(null)}
        />
      )}
    </div>
  );
};

const CreateProductFromCatalogModal: React.FC<{
  item: SupplierCatalogItem;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ item, onClose, onSuccess }) => {
  const [sku, setSku] = useState(item.code);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.application || item.name);
  const [brand, setBrand] = useState(item.brand);
  const [categoryName, setCategoryName] = useState(item.category);
  const [priceInput, setPriceInput] = useState(item.priceCents > 0 ? centsToInput(item.priceCents) : '');
  const [costInput, setCostInput] = useState('');
  const [initialStock, setInitialStock] = useState(1);
  const [shelfNumber, setShelfNumber] = useState('');
  const [shelfLevel, setShelfLevel] = useState('');
  const [compartment, setCompartment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const priceCents = parseMoneyToCents(priceInput);
    if (priceCents === null || priceCents <= 0) {
      setErrorMsg('Ingresá un precio de venta válido en ARS.');
      return;
    }

    const costCents = costInput.trim() ? parseMoneyToCents(costInput) : null;

    const payload = {
      sku: sku.trim(),
      name: name.trim(),
      description: description.trim() || null,
      brand: brand.trim() || null,
      categoryName: categoryName.trim() || null,
      priceCents,
      costCents,
      initialStock: Number(initialStock) || 0,
      shelfNumber: shelfNumber.trim() || null,
      shelfLevel: shelfLevel.trim() || null,
      compartment: compartment.trim() || null,
      innerDiameterMm: item.innerDiameterMm,
      outerDiameterMm: item.outerDiameterMm,
      widthMm: item.widthMm,
      supplierName: item.supplierName,
      supplierCode: item.code,
      unit: 'unidad',
    };

    setSubmitting(true);
    try {
      await apiFetch('/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      alert(`Producto "${sku}" incorporado exitosamente al inventario.`);
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al incorporar producto a inventario.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h3 className="font-bold text-base text-slate-900">
              Incorporar a Inventario de Hugo
            </h3>
            <p className="text-xs text-slate-500">
              Datos técnicos precargados desde catálogo oficial de {item.supplierName}.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SKU en tu sistema *</label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Marca</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre comercial *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Descripción y aplicaciones</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-700"
            />
          </div>

          {item.dimensions && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between text-xs text-blue-900">
              <span className="flex items-center gap-1.5 font-medium">
                <Ruler className="h-3.5 w-3.5 text-blue-600" />
                Medidas técnicas vinculadas:
              </span>
              <span className="font-mono font-bold">{item.dimensions}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Precio Venta (ARS) *</label>
              <input
                type="text"
                required
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="Ej: 3500"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Costo Compra</label>
              <input
                type="text"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                placeholder="Ej: 1800"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Inicial</label>
              <input
                type="number"
                min="0"
                value={initialStock}
                onChange={(e) => setInitialStock(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-center font-bold text-slate-800"
              />
            </div>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-amber-600" />
              Asignar Estantería Física
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Estantería</label>
                <input
                  type="text"
                  value={shelfNumber}
                  onChange={(e) => setShelfNumber(e.target.value.toUpperCase())}
                  placeholder="Ej: E01"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Nivel</label>
                <input
                  type="text"
                  value={shelfLevel}
                  onChange={(e) => setShelfLevel(e.target.value.toUpperCase())}
                  placeholder="Ej: A"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Compartimento</label>
                <input
                  type="text"
                  value={compartment}
                  onChange={(e) => setCompartment(e.target.value)}
                  placeholder="Ej: 1"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-mono font-bold"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-medium cursor-pointer active:scale-96"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-96 transition-all"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              <span>Crear Producto</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
