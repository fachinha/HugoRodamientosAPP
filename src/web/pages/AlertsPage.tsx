import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  PlusCircle,
  Package,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  HelpCircle,
  X,
  Check,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import type { StockAlertItem } from '../../worker/services/alerts.service';
import { useAuth } from '../context/AuthContext';

export const AlertsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [alerts, setAlerts] = useState<StockAlertItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'out' | 'low' | 'no_min'>('all');

  // Modal para registrar entrada rápida de reposición
  const [entryModalProduct, setEntryModalProduct] = useState<StockAlertItem | null>(null);
  const [entryQuantity, setEntryQuantity] = useState<number>(10);
  const [entryReason, setEntryReason] = useState<string>('Reposición por alerta de stock');
  const [submittingEntry, setSubmittingEntry] = useState(false);
  const [entryMsg, setEntryMsg] = useState<string | null>(null);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/alerts?status=${statusFilter}`);
      setAlerts(res.items);
      setSummary(res.summary);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [statusFilter]);

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
      fetchAlerts();
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
      {/* Encabezado */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Alertas de Stock y Reposición</h2>
        <p className="text-xs text-slate-500">
          Listado priorizado de productos que requieren reposición para evitar pérdidas de ventas en el mostrador.
        </p>
      </div>

      {/* Tarjetas resumen de estado */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => setStatusFilter(statusFilter === 'out' ? 'all' : 'out')}
          className={`p-4 rounded-xl border shadow-xs cursor-pointer transition-all ${
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
          <p className="text-[11px] text-rose-600 mt-1">Existencia igual a 0 unidades</p>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'low' ? 'all' : 'low')}
          className={`p-4 rounded-xl border shadow-xs cursor-pointer transition-all ${
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
          className={`p-4 rounded-xl border shadow-xs cursor-pointer transition-all ${
            statusFilter === 'no_min'
              ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-500/20'
              : 'bg-white border-purple-200 hover:border-purple-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">Mínimo sin definir</span>
            <HelpCircle className="h-5 w-5 text-purple-600" />
          </div>
          <h3 className="text-3xl font-extrabold text-purple-800 mt-2">{summary?.undefinedMin ?? 0}</h3>
          <p className="text-[11px] text-purple-600 mt-1">Requieren configurar un umbral de alerta</p>
        </div>
      </div>

      {/* Listado Priorizado */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Listado priorizado de reposición ({alerts.length})
            </h3>
          </div>
          {statusFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="text-xs text-sky-600 hover:underline font-medium"
            >
              Mostrar todos
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-400 gap-2 text-xs">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
            <span>Calculando alertas de inventario...</span>
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            🎉 ¡Excelente! No hay productos en estado de alerta con el filtro seleccionado.
          </div>
        ) : (
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
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
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
        )}
      </div>

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
                className="text-slate-400 hover:text-slate-600"
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
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingEntry}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
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
