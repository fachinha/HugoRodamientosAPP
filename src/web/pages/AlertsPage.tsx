import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  AlertOctagon,
  PlusCircle,
  Package,
  ArrowRight,
  HelpCircle,
  X,
  Check,
  CheckCircle2,
  Loader2,
  ClipboardCheck,
  Users,
  Truck,
  PhoneOff,
  MailWarning,
  FileWarning,
  MapPinOff,
  Tag,
  DollarSign,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { formatARS } from '../../shared/money';
import type { StockAlertItem, DataQualityReport } from '../../worker/services/alerts.service';
import { useAuth } from '../context/AuthContext';

export const AlertsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') === 'data-quality' ? 'data-quality' : 'stock';
  const initialStatus = (searchParams.get('status') as 'all' | 'out' | 'low' | 'no_min') || 'all';

  const [activeTab, setActiveTab] = useState<'stock' | 'data-quality'>(initialTab);
  const [alerts, setAlerts] = useState<StockAlertItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'out' | 'low' | 'no_min'>(
    ['all', 'out', 'low', 'no_min'].includes(initialStatus) ? initialStatus : 'all',
  );

  // Estado de auditoría de datos faltantes
  const [dataQuality, setDataQuality] = useState<DataQualityReport | null>(null);
  const [loadingQuality, setLoadingQuality] = useState(false);

  // Modal para registrar entrada rápida de reposición
  const [entryModalProduct, setEntryModalProduct] = useState<StockAlertItem | null>(null);
  const [entryQuantity, setEntryQuantity] = useState<number>(10);
  const [entryReason, setEntryReason] = useState<string>('Reposición por alerta de stock');
  const [submittingEntry, setSubmittingEntry] = useState(false);
  const [entryMsg, setEntryMsg] = useState<string | null>(null);

  const fetchAlerts = async (p = 1) => {
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/alerts?status=${statusFilter}&page=${p}&pageSize=50`);
      setAlerts(res.items || []);
      setSummary(res.summary || null);
      setPage(res.page || 1);
      setTotalPages(res.totalPages || 1);
      setTotalItems(res.total || 0);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchDataQuality = async () => {
    setLoadingQuality(true);
    try {
      const res = await apiFetch<DataQualityReport>('/alerts/data-quality');
      setDataQuality(res);
    } catch {
      // Ignorar si falla
    } finally {
      setLoadingQuality(false);
    }
  };

  useEffect(() => {
    fetchAlerts(1);
  }, [statusFilter]);

  useEffect(() => {
    fetchDataQuality();
  }, []);

  const switchTab = (tab: 'stock' | 'data-quality') => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'data-quality') next.set('tab', 'data-quality');
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  };

  const handleQuickEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryModalProduct || entryQuantity <= 0) return;

    setSubmittingEntry(true);
    setEntryMsg(null);
    const idempotencyKey = `entry_alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      await apiFetch('/stock/entries', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey,
          productId: entryModalProduct.productId,
          quantity: entryQuantity,
          kind: 'purchase',
          reason: entryReason.trim(),
        }),
      });
      setEntryModalProduct(null);
      fetchAlerts(page);
      fetchDataQuality();
    } catch (err: any) {
      setEntryMsg(err.message || 'Error al registrar la entrada.');
    } finally {
      setSubmittingEntry(false);
    }
  };

  const openQuickEntryModal = (item: StockAlertItem) => {
    setEntryModalProduct(item);
    setEntryQuantity(item.suggestedReplenishment.quantity > 0 ? item.suggestedReplenishment.quantity : 10);
    setEntryReason(`Reposición por alerta: ${item.statusLabel}`);
    setEntryMsg(null);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Encabezado directo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Alertas de Stock y Datos Faltantes
          </h2>
          <p className="text-xs text-slate-500">
            Control de reposición de mostrador y diagnóstico automático de fichas incompletas en productos, clientes y proveedores.
          </p>
        </div>

        {/* Selector de pestañas */}
        <div className="inline-flex bg-slate-200/80 p-1 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => switchTab('stock')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-96 ${
              activeTab === 'stock'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span>Alertas de Stock</span>
            {(summary?.totalRequiringAttention ?? 0) > 0 && (
              <span className="bg-rose-600 text-white px-1.5 py-0.5 rounded-full text-[10px]">
                {summary.totalRequiringAttention}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => switchTab('data-quality')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-96 ${
              activeTab === 'data-quality'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ClipboardCheck className="h-3.5 w-3.5 text-orange-600" />
            <span>Datos Faltantes</span>
            {(dataQuality?.totalActionableIssues ?? 0) > 0 && (
              <span className="bg-orange-600 text-white px-1.5 py-0.5 rounded-full text-[10px]">
                {dataQuality?.totalActionableIssues}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ======================================================================= */}
      {/* PESTAÑA 1: ALERTAS DE STOCK                                             */}
      {/* ======================================================================= */}
      {activeTab === 'stock' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              onClick={() => setStatusFilter(statusFilter === 'out' ? 'all' : 'out')}
              className={`p-4 rounded-xl border shadow-xs cursor-pointer transition-all hover:-translate-y-0.5 active:scale-98 ${
                statusFilter === 'out'
                  ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-500/20'
                  : 'bg-white border-rose-200 hover:border-rose-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Agotados (Urgente)</span>
                <AlertOctagon className="h-5 w-5 text-rose-600" />
              </div>
              <h3 className="text-3xl font-extrabold text-rose-800 mt-2">{summary?.outOfStock ?? 0}</h3>
              <p className="text-[11px] text-rose-600 mt-1">Productos activos con stock agotado</p>
            </div>

            <div
              onClick={() => setStatusFilter(statusFilter === 'low' ? 'all' : 'low')}
              className={`p-4 rounded-xl border shadow-xs cursor-pointer transition-all hover:-translate-y-0.5 active:scale-98 ${
                statusFilter === 'low'
                  ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20'
                  : 'bg-white border-amber-200 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Stock Bajo (Prioritario)</span>
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="text-3xl font-extrabold text-amber-800 mt-2">{summary?.lowStock ?? 0}</h3>
              <p className="text-[11px] text-amber-600 mt-1">Stock menor o igual al mínimo</p>
            </div>

            <div
              onClick={() => setStatusFilter(statusFilter === 'no_min' ? 'all' : 'no_min')}
              className={`p-4 rounded-xl border shadow-xs cursor-pointer transition-all hover:-translate-y-0.5 active:scale-98 ${
                statusFilter === 'no_min'
                  ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-500/20'
                  : 'bg-white border-purple-200 hover:border-purple-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">Con stock sin mínimo</span>
                <HelpCircle className="h-5 w-5 text-purple-600" />
              </div>
              <h3 className="text-3xl font-extrabold text-purple-800 mt-2">{summary?.undefinedMin ?? 0}</h3>
              <p className="text-[11px] text-purple-600 mt-1">Tienen unidades pero falta definir mínimo</p>
            </div>
          </div>

          {(summary?.uncountedMigratedStock ?? 0) > 0 && (
            <div className="bg-slate-900 text-slate-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3">
                <ClipboardCheck className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white">
                    {summary.uncountedMigratedStock.toLocaleString('es-AR')} artículos migrados están pendientes de recuento físico de stock
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    En el respaldo de Gestión FE10 venía el catálogo y precios, pero no el conteo físico general (excepto retenes). A medida que ingresen facturas o cuenten estanterías, quedarán activos en las alertas de stock.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => switchTab('data-quality')}
                className="px-3.5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-lg shrink-0 cursor-pointer transition-all active:scale-96"
              >
                Ver diagnóstico completo
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Listado priorizado de reposición ({totalItems})
                </h3>
              </div>
              {statusFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="text-xs text-orange-600 hover:underline font-medium cursor-pointer"
                >
                  Mostrar todos
                </button>
              )}
            </div>

            {loading ? (
              <div className="p-12 flex items-center justify-center text-slate-400 gap-2 text-xs">
                <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
                <span>Calculando alertas de inventario...</span>
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                <p className="font-semibold text-slate-700">No hay productos en alerta con el filtro seleccionado.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Prioridad</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3">Marca / Categoría</th>
                        <th className="px-4 py-3 text-center">Stock actual</th>
                        <th className="px-4 py-3 text-center">Mínimo</th>
                        <th className="px-4 py-3 text-center">Diferencia</th>
                        <th className="px-4 py-3">Sugerencia de reposición</th>
                        <th className="px-4 py-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {alerts.map((item) => (
                        <tr key={item.productId} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.priority === 1
                                  ? 'bg-rose-100 text-rose-800'
                                  : item.priority === 2
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {item.priorityLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {item.sku}
                          </td>
                          <td className="px-4 py-3 max-w-xs font-medium text-slate-900 truncate">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                            {item.brand && <span className="font-semibold text-slate-700">{item.brand}</span>}
                            {item.categoryName && <span className="text-[10px] block text-slate-400">{item.categoryName}</span>}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span
                              className={`font-bold px-2 py-0.5 rounded-full ${
                                item.stock === 0 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.stock}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap text-slate-600 font-medium">
                            {item.minStock ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {item.differenceToMin !== null ? (
                              <span className="font-bold text-rose-600">{item.differenceToMin}</span>
                            ) : (
                              <span className="text-slate-400">N/D</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {item.suggestedReplenishment.quantity > 0 ? (
                              <div>
                                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  + {item.suggestedReplenishment.quantity} un.
                                </span>
                                <p className="text-[10px] text-slate-400 mt-0.5">{item.suggestedReplenishment.explanation}</p>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">{item.suggestedReplenishment.explanation}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => openQuickEntryModal(item)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition-all cursor-pointer active:scale-96"
                              >
                                <PlusCircle className="h-3.5 w-3.5" />
                                <span>Reponer</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="p-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 bg-slate-50/60">
                    <span>
                      Página <strong>{page}</strong> de <strong>{totalPages}</strong>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => fetchAlerts(page - 1)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 bg-white rounded-md disabled:opacity-40 cursor-pointer active:scale-96"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        <span>Anterior</span>
                      </button>
                      <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => fetchAlerts(page + 1)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 bg-white rounded-md disabled:opacity-40 cursor-pointer active:scale-96"
                      >
                        <span>Siguiente</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ======================================================================= */}
      {/* PESTAÑA 2: AUDITORÍA DE DATOS FALTANTES                                 */}
      {/* ======================================================================= */}
      {activeTab === 'data-quality' && (
        <div className="space-y-6">
          {loadingQuality || !dataQuality ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
              <span>Auditando integridad de productos, clientes y proveedores...</span>
            </div>
          ) : (
            <>
              {/* 1. PRODUCTOS */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Package className="h-4 w-4 text-orange-600" />
                      <span>Catálogo de Productos ({dataQuality.products.totalActive.toLocaleString('es-AR')} activos)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Hacé clic en cualquier tarjeta para abrir el catálogo filtrado exactamente por los repuestos a completar.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <Link
                    to="/products?missing=price"
                    className="p-4 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-50 transition-all hover:-translate-y-0.5 active:scale-98 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-800">Sin precio de venta ($0)</span>
                      <DollarSign className="h-4 w-4 text-rose-600" />
                    </div>
                    <p className="text-2xl font-black text-rose-900 mt-2">
                      {dataQuality.products.missingPrice.toLocaleString('es-AR')}
                    </p>
                    <span className="text-[11px] text-rose-700 font-semibold mt-2 inline-flex items-center gap-1">
                      <span>Ir a cargar precios faltantes</span>
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>

                  <Link
                    to="/products?missing=cost"
                    className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50 transition-all hover:-translate-y-0.5 active:scale-98 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900">Sin costo de compra</span>
                      <FileWarning className="h-4 w-4 text-amber-600" />
                    </div>
                    <p className="text-2xl font-black text-amber-950 mt-2">
                      {dataQuality.products.missingCost.toLocaleString('es-AR')}
                    </p>
                    <span className="text-[11px] text-amber-800 font-semibold mt-2 inline-flex items-center gap-1">
                      <span>Completar costos para margen real</span>
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>

                  <Link
                    to="/products?missing=supplier"
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 transition-all hover:-translate-y-0.5 active:scale-98 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Sin proveedor asignado</span>
                      <Truck className="h-4 w-4 text-slate-600" />
                    </div>
                    <p className="text-2xl font-black text-slate-900 mt-2">
                      {dataQuality.products.missingSupplier.toLocaleString('es-AR')}
                    </p>
                    <span className="text-[11px] text-orange-600 font-semibold mt-2 inline-flex items-center gap-1">
                      <span>Asignar proveedor habitual</span>
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>

                  <Link
                    to="/products?missing=location"
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 transition-all hover:-translate-y-0.5 active:scale-98 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Sin ubicación en estantería</span>
                      <MapPinOff className="h-4 w-4 text-slate-600" />
                    </div>
                    <p className="text-2xl font-black text-slate-900 mt-2">
                      {dataQuality.products.missingLocation.toLocaleString('es-AR')}
                    </p>
                    <span className="text-[11px] text-orange-600 font-semibold mt-2 inline-flex items-center gap-1">
                      <span>Asignar estantería / casillero</span>
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>

                  <Link
                    to="/products?missing=brand"
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 transition-all hover:-translate-y-0.5 active:scale-98 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Sin marca identificada</span>
                      <Tag className="h-4 w-4 text-slate-600" />
                    </div>
                    <p className="text-2xl font-black text-slate-900 mt-2">
                      {dataQuality.products.missingBrand.toLocaleString('es-AR')}
                    </p>
                    <span className="text-[11px] text-orange-600 font-semibold mt-2 inline-flex items-center gap-1">
                      <span>Completar marcas faltantes</span>
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>

                  <Link
                    to="/products?missing=min_stock"
                    className="p-4 rounded-xl border border-purple-200 bg-purple-50/40 hover:bg-purple-50 transition-all hover:-translate-y-0.5 active:scale-98 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-900">Sin stock físico / mínimo relevado</span>
                      <HelpCircle className="h-4 w-4 text-purple-600" />
                    </div>
                    <p className="text-2xl font-black text-purple-950 mt-2">
                      {dataQuality.products.pendingPhysicalStockCount.toLocaleString('es-AR')}
                    </p>
                    <span className="text-[11px] text-purple-800 font-semibold mt-2 inline-flex items-center gap-1">
                      <span>Cargar stock y umbral mínimo</span>
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>
                </div>

                {dataQuality.products.samplesMissingPrice.length > 0 && (
                  <div className="pt-2">
                    <h4 className="text-xs font-bold text-slate-700 mb-2">
                      Últimos artículos cargados que figuran en $0 (requieren precio antes de vender):
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {dataQuality.products.samplesMissingPrice.map((sp) => (
                        <Link
                          key={sp.id}
                          to={`/products?missing=price&q=${encodeURIComponent(sp.sku)}`}
                          className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-xs text-slate-800 inline-flex items-center gap-1.5 transition-colors"
                        >
                          <span className="font-mono font-bold text-rose-700">{sp.sku}</span>
                          <span className="truncate max-w-[190px]">{sp.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. CLIENTES Y CUENTAS CORRIENTES */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Users className="h-4 w-4 text-indigo-600" />
                      <span>Clientes y Cuentas Corrientes ({dataQuality.customers.totalCustomers} registrados)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Fundamental para enviar presupuestos por WhatsApp o Mail y gestionar cobranzas de cuenta corriente.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <Link
                    to="/crm?tab=customers&missing=phone"
                    className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50 transition-all hover:-translate-y-0.5 active:scale-98"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900">Sin WhatsApp / Teléfono</span>
                      <PhoneOff className="h-4 w-4 text-amber-600" />
                    </div>
                    <p className="text-2xl font-black text-amber-950 mt-2">{dataQuality.customers.missingPhone}</p>
                    <span className="text-[11px] text-amber-800 font-semibold mt-2 inline-flex items-center gap-1">
                      <span>Agendar teléfonos faltantes</span>
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>

                  <Link
                    to="/crm?tab=customers&missing=email"
                    className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50 transition-all hover:-translate-y-0.5 active:scale-98"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-900">Sin correo electrónico</span>
                      <MailWarning className="h-4 w-4 text-indigo-600" />
                    </div>
                    <p className="text-2xl font-black text-indigo-950 mt-2">{dataQuality.customers.missingEmail}</p>
                    <span className="text-[11px] text-indigo-800 font-semibold mt-2 inline-flex items-center gap-1">
                      <span>Cargar mails para envío de cotizaciones</span>
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>

                  <Link
                    to="/crm?tab=customers&missing=cuit"
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 transition-all hover:-translate-y-0.5 active:scale-98"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Sin CUIT registrado</span>
                      <FileWarning className="h-4 w-4 text-slate-600" />
                    </div>
                    <p className="text-2xl font-black text-slate-900 mt-2">{dataQuality.customers.missingCuit}</p>
                    <span className="text-[11px] text-orange-600 font-semibold mt-2 inline-flex items-center gap-1">
                      <span>Completar CUIT fiscal</span>
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>
                </div>

                {dataQuality.customers.debtorsMissingContact.length > 0 && (
                  <div className="pt-2">
                    <h4 className="text-xs font-bold text-slate-800 mb-2">
                      Prioridad de cobranza: Clientes con saldo deudor que tienen contacto incompleto
                    </h4>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2">Cliente</th>
                            <th className="px-3 py-2 text-right">Saldo en Cuenta Cte.</th>
                            <th className="px-3 py-2">Datos que faltan</th>
                            <th className="px-3 py-2 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {dataQuality.customers.debtorsMissingContact.map((c) => (
                            <tr key={c.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-bold text-slate-900">{c.name}</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-rose-700">
                                {formatARS(c.balanceCents)}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {c.missingPhone && (
                                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[10px]">
                                      Falta Teléfono/WhatsApp
                                    </span>
                                  )}
                                  {c.missingEmail && (
                                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-semibold text-[10px]">
                                      Falta Mail
                                    </span>
                                  )}
                                  {c.missingCuit && (
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">
                                      Falta CUIT
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Link
                                  to={`/crm?tab=customers&q=${encodeURIComponent(c.name)}`}
                                  className="text-orange-600 hover:underline font-bold"
                                >
                                  Completar ficha
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. PROVEEDORES */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Truck className="h-4 w-4 text-emerald-600" />
                      <span>Directorio de Proveedores ({dataQuality.suppliers.totalSuppliers} activos)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Se recuperaron los proveedores y marcas desde Gestión FE10, pero falta agendar su WhatsApp de pedidos, mail y CUIT.
                    </p>
                  </div>
                  <Link
                    to="/replenishment?tab=suppliers"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg self-start transition-all active:scale-96"
                  >
                    <span>Ir al Directorio de Proveedores</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {dataQuality.suppliers.incompleteSuppliers.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {dataQuality.suppliers.incompleteSuppliers.map((s) => (
                      <Link
                        key={s.id}
                        to={`/replenishment?tab=suppliers&editSupplier=${s.id}`}
                        className="p-3 rounded-lg border border-slate-200 hover:border-orange-400 bg-slate-50/50 hover:bg-orange-50/30 transition-all flex flex-col justify-between gap-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-xs text-slate-900">{s.name}</span>
                          <span className="text-[10px] text-slate-500 shrink-0">{s.city}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {s.missingPhone && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-semibold">
                              Sin WhatsApp
                            </span>
                          )}
                          {s.missingEmail && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-900 text-[10px] font-semibold">
                              Sin Mail
                            </span>
                          )}
                          {s.missingCuit && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-semibold">
                              Sin CUIT
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal para registrar reposición rápida */}
      {entryModalProduct && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Registrar entrada de mercadería</h4>
                <p className="text-xs text-slate-500">{entryModalProduct.name} ({entryModalProduct.sku})</p>
              </div>
              <button
                type="button"
                onClick={() => setEntryModalProduct(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {entryMsg && (
              <div className="p-2.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-xs">
                {entryMsg}
              </div>
            )}

            <form onSubmit={handleQuickEntry} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad a ingresar *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={entryQuantity}
                  onChange={(e) => setEntryQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Motivo / Documento</label>
                <input
                  type="text"
                  value={entryReason}
                  onChange={(e) => setEntryReason(e.target.value)}
                  placeholder="Ej: Remito proveedor N° 458"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEntryModalProduct(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium cursor-pointer active:scale-96"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingEntry}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer active:scale-96"
                >
                  {submittingEntry ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span>Confirmar entrada</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
