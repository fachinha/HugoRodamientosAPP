import React, { useState, useEffect } from 'react';
import {
  Layers,
  PlusCircle,
  Sliders,
  Search,
  Barcode,
  Check,
  X,
  AlertTriangle,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../../shared/time';
import type { MovementListItem } from '../../worker/services/stock.service';

export const InventoryPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Modales
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);

  // Producto seleccionado para operar
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Campos de formulario
  const [quantity, setQuantity] = useState<number>(1);
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Movimientos recientes
  const [movements, setMovements] = useState<MovementListItem[]>([]);
  const [loadingMovs, setLoadingMovs] = useState(true);

  const loadMovements = async () => {
    setLoadingMovs(true);
    try {
      const res = await apiFetch<any>('/movements?pageSize=25');
      setMovements(res.items || []);
    } catch {
      setMovements([]);
    } finally {
      setLoadingMovs(false);
    }
  };

  useEffect(() => {
    loadMovements();
  }, []);

  const handleScanProduct = async (code: string) => {
    try {
      const res = await apiFetch<{ found: boolean; product: any }>(`/products/by-code/${encodeURIComponent(code)}`);
      if (res.found && res.product) {
        setSelectedProduct(res.product);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const handleSearchProduct = async () => {
    if (!productSearch.trim()) return;
    try {
      const res = await apiFetch<any>(`/products?q=${encodeURIComponent(productSearch)}&pageSize=5`);
      setSearchResults(res.items || []);
    } catch {
      setSearchResults([]);
    }
  };

  const handleEntrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || quantity <= 0) return;

    setSubmitting(true);
    setFeedbackMsg(null);
    const idempotencyKey = `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const res = await apiFetch<any>('/stock/entries', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey,
          productId: selectedProduct.id,
          quantity,
          kind: 'purchase',
          reason: reason.trim() || 'Entrada de mercadería por remito/factura',
        }),
      });

      setFeedbackMsg({
        type: 'success',
        text: `Entrada registrada con éxito para "${selectedProduct.name}". Nuevo stock: ${res.currentStock}.`,
      });
      setEntryModalOpen(false);
      resetForm();
      loadMovements();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al registrar la entrada.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || quantity <= 0 || !reason.trim()) return;

    setSubmitting(true);
    setFeedbackMsg(null);
    const idempotencyKey = `adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const res = await apiFetch<any>('/stock/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey,
          productId: selectedProduct.id,
          direction,
          quantity,
          reason: reason.trim(),
        }),
      });

      setFeedbackMsg({
        type: 'success',
        text: `Ajuste (${direction === 'in' ? '+' : '-'}${quantity}) registrado para "${selectedProduct.name}". Nuevo stock: ${res.currentStock}.`,
      });
      setAdjustModalOpen(false);
      resetForm();
      loadMovements();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al registrar el ajuste.' });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedProduct(null);
    setQuantity(1);
    setReason('');
    setProductSearch('');
    setSearchResults([]);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Encabezado y acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Gestión de Inventario</h2>
          <p className="text-xs text-slate-500">
            Carga de mercadería, ajustes auditados con motivo y control de existencias.
          </p>
        </div>

        {isAdmin && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setEntryModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Entrada de mercadería</span>
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setAdjustModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Sliders className="h-4 w-4 text-sky-600" />
              <span>Ajuste manual (+/−)</span>
            </button>
          </div>
        )}
      </div>

      {feedbackMsg && (
        <div
          className={`p-3 rounded-lg text-xs flex justify-between items-center ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button type="button" onClick={() => setFeedbackMsg(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tabla de movimientos de auditoría */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Historial reciente de movimientos</h3>
          <span className="text-xs text-slate-400">Solo inserción (inmutable)</span>
        </div>

        {loadingMovs ? (
          <div className="p-12 text-center text-slate-400 text-xs">Cargando movimientos...</div>
        ) : movements.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">Aún no hay movimientos de stock.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Tipo operación</th>
                  <th className="px-4 py-3 text-right">Variación</th>
                  <th className="px-4 py-3 text-right">Stock anterior</th>
                  <th className="px-4 py-3 text-right">Stock posterior</th>
                  <th className="px-4 py-3">Motivo / Documento</th>
                  <th className="px-4 py-3">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((m) => {
                  const isPos = m.quantity > 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{formatDateTime(m.createdAt)}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">{m.productSku}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800 max-w-xs truncate">{m.productName}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {m.typeLabel}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-bold whitespace-nowrap ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPos ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">{m.stockBefore}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{m.stockAfter}</td>
                      <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">{m.reason || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{m.userDisplayName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Entrada de mercadería */}
      {entryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h4 className="text-sm font-bold text-slate-900">Registrar entrada de mercadería</h4>
              <button type="button" onClick={() => setEntryModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEntrySubmit} className="space-y-4">
              {/* Selección del producto */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Escanear o buscar producto *</label>
                <BarcodeScanner onScan={handleScanProduct} placeholder="Escanear código con la pistola..." />

                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="O buscar por SKU / nombre..."
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleSearchProduct}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold"
                  >
                    Buscar
                  </button>
                </div>

                {searchResults.length > 0 && !selectedProduct && (
                  <div className="mt-2 max-h-36 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100 bg-white">
                    {searchResults.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedProduct(p);
                          setSearchResults([]);
                        }}
                        className="p-2 hover:bg-slate-50 cursor-pointer flex justify-between items-center text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{p.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">SKU: {p.sku}</p>
                        </div>
                        <span className="text-slate-600 font-bold">Stock: {p.stock}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedProduct && (
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs space-y-1">
                  <p className="font-bold text-sky-900">{selectedProduct.name}</p>
                  <p className="text-sky-700 font-mono">SKU: {selectedProduct.sku} · Stock actual: {selectedProduct.stock}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad a ingresar *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Motivo / Número de factura o remito</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej: Factura A N° 0001-00045882 de distribuidora"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEntryModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!selectedProduct || submitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span>Registrar entrada</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ajuste manual */}
      {adjustModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h4 className="text-sm font-bold text-slate-900">Ajuste manual de existencias</h4>
              <button type="button" onClick={() => setAdjustModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustmentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Escanear o buscar producto *</label>
                <BarcodeScanner onScan={handleScanProduct} placeholder="Escanear código..." />

                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="O buscar por SKU / nombre..."
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleSearchProduct}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold"
                  >
                    Buscar
                  </button>
                </div>

                {searchResults.length > 0 && !selectedProduct && (
                  <div className="mt-2 max-h-36 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100 bg-white">
                    {searchResults.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedProduct(p);
                          setSearchResults([]);
                        }}
                        className="p-2 hover:bg-slate-50 cursor-pointer flex justify-between items-center text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{p.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">SKU: {p.sku}</p>
                        </div>
                        <span className="text-slate-600 font-bold">Stock: {p.stock}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedProduct && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
                  <p className="font-bold text-amber-900">{selectedProduct.name}</p>
                  <p className="text-amber-700 font-mono">SKU: {selectedProduct.sku} · Stock actual: {selectedProduct.stock}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dirección del ajuste *</label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as 'in' | 'out')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium"
                  >
                    <option value="in">Ajuste positivo (+) Entrada</option>
                    <option value="out">Ajuste negativo (−) Salida</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Motivo obligatorio del ajuste (auditable) *
                </label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej: Recuento físico de mostrador, rotura de empaque, etc."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!selectedProduct || !reason.trim() || submitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span>Confirmar ajuste</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
