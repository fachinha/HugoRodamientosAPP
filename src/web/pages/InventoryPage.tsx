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
  Sparkles,
  FileText,
  Building2,
  Calendar,
  Eye,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { InvoiceUploaderModal } from '../components/InvoiceUploaderModal';
import { InvoiceReviewModal } from '../components/InvoiceReviewModal';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../../shared/time';
import { formatARS } from '../../shared/money';
import type { MovementListItem } from '../../worker/services/stock.service';
import type { InvoiceParsedHeader, InvoiceMatchedItem } from '../../shared/schemas';

export const InventoryPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Pestaña activa: movimientos (kardex) vs facturas
  const [activeTab, setActiveTab] = useState<'movements' | 'invoices'>('movements');

  // Modales
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [invoiceUploaderOpen, setInvoiceUploaderOpen] = useState(false);
  const [invoiceReviewOpen, setInvoiceReviewOpen] = useState(false);
  const [parsedInvoiceData, setParsedInvoiceData] = useState<{
    invoice: InvoiceParsedHeader;
    items: InvoiceMatchedItem[];
    existingInvoiceWarning?: string | null;
  } | null>(null);

  // Modal de detalle de factura histórica
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] = useState<any | null>(null);
  const [loadingInvoiceDetail, setLoadingInvoiceDetail] = useState(false);

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

  // Facturas recientes
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

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

  const loadInvoices = async () => {
    setLoadingInvoices(true);
    try {
      const res = await apiFetch<any>('/invoices?pageSize=25');
      setInvoices(res.items || []);
    } catch {
      setInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  useEffect(() => {
    loadMovements();
    if (isAdmin) {
      loadInvoices();
    }
  }, [isAdmin]);

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

  const handleViewInvoiceDetail = async (id: number) => {
    setLoadingInvoiceDetail(true);
    try {
      const data = await apiFetch<any>(`/invoices/${id}`);
      setSelectedInvoiceDetail(data);
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al cargar el detalle de la factura.' });
    } finally {
      setLoadingInvoiceDetail(false);
    }
  };

  const handleInvoiceConfirmed = (result: any) => {
    setFeedbackMsg({
      type: 'success',
      text: `¡Factura confirmada exitosamente! Se ingresaron ${result.totalUnitsAdded} piezas al stock (${result.updatedCount} existencias actualizadas, ${result.createdCount} productos nuevos creados).`,
    });
    loadMovements();
    loadInvoices();
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setInvoiceUploaderOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              <span>Cargar Factura (PDF / IA)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setEntryModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Entrada manual</span>
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setAdjustModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Sliders className="h-4 w-4 text-orange-600" />
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

      {/* Contenedor con Pestañas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('movements')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeTab === 'movements'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Historial de movimientos (Kardex)
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('invoices')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'invoices'
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Facturas de compra ({invoices.length})</span>
              </button>
            )}
          </div>
          <span className="text-xs text-slate-400">
            {activeTab === 'movements' ? 'Solo inserción (inmutable)' : 'Comprobantes de distribuidores'}
          </span>
        </div>

        {/* Pestaña: Kardex de movimientos */}
        {activeTab === 'movements' && (
          loadingMovs ? (
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
          )
        )}

        {/* Pestaña: Facturas de compra de distribuidores */}
        {activeTab === 'invoices' && (
          loadingInvoices ? (
            <div className="p-12 text-center text-slate-400 text-xs">Cargando facturas registradas...</div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs space-y-2">
              <p>Aún no se han cargado facturas de compra con IA.</p>
              <button
                type="button"
                onClick={() => setInvoiceUploaderOpen(true)}
                className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
                <span>Cargar la primera factura ahora</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Fecha Emisión</th>
                    <th className="px-4 py-3">Proveedor</th>
                    <th className="px-4 py-3">N° Factura</th>
                    <th className="px-4 py-3 text-center">Artículos</th>
                    <th className="px-4 py-3 text-right">Total Facturado</th>
                    <th className="px-4 py-3">Responsable</th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-medium">
                        {inv.invoice_date}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{inv.supplier_name}</p>
                        {inv.supplier_cuit && (
                          <p className="text-[10px] text-slate-400 font-mono">CUIT: {inv.supplier_cuit}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">
                        {inv.invoice_number}
                      </td>
                      <td className="px-4 py-3 text-center font-bold">
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-700">
                          {inv.items_count} un.
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold font-mono text-slate-900">
                        {formatARS(inv.total_cents)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {inv.user_name}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleViewInvoiceDetail(inv.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Ver detalle</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
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
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs space-y-1">
                  <p className="font-bold text-orange-950">{selectedProduct.name}</p>
                  <p className="text-orange-800 font-mono">SKU: {selectedProduct.sku} · Stock actual: {selectedProduct.stock}</p>
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
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span>Confirmar ajuste</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Detalle de factura registrada y movimientos */}
      {selectedInvoiceDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    Factura {selectedInvoiceDetail.invoice.invoice_number}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    Ingresada
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Proveedor: <strong className="text-slate-800">{selectedInvoiceDetail.invoice.supplier_name}</strong>
                  {selectedInvoiceDetail.invoice.supplier_cuit && ` · CUIT: ${selectedInvoiceDetail.invoice.supplier_cuit}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoiceDetail(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[11px] font-semibold text-slate-500">Fecha de Emisión</p>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">{selectedInvoiceDetail.invoice.invoice_date || '-'}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[11px] font-semibold text-slate-500">Artículos Ingresados</p>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">{selectedInvoiceDetail.invoice.items_count} un.</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[11px] font-semibold text-slate-500">Total Facturado</p>
                  <p className="text-xs font-bold text-emerald-700 font-mono mt-0.5">{formatARS(selectedInvoiceDetail.invoice.total_cents)}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[11px] font-semibold text-slate-500">Ingresado por</p>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">{selectedInvoiceDetail.invoice.user_name}</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  Movimientos generados en Kardex ({selectedInvoiceDetail.movements.length})
                </h4>
                {selectedInvoiceDetail.movements.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-4 text-center bg-slate-50 rounded-lg">
                    No se registraron movimientos individuales vinculados a este comprobante.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2">Producto</th>
                          <th className="px-3 py-2 text-right">Cantidad (+)</th>
                          <th className="px-3 py-2 text-right">Stock Previo</th>
                          <th className="px-3 py-2 text-right">Nuevo Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedInvoiceDetail.movements.map((mov: any) => (
                          <tr key={mov.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono font-bold text-slate-800">{mov.product_sku}</td>
                            <td className="px-3 py-2 font-medium text-slate-900">{mov.product_name}</td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-600">+{mov.quantity}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{mov.stock_before}</td>
                            <td className="px-3 py-2 text-right font-bold text-slate-800">{mov.stock_after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedInvoiceDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modales de Facturación con IA */}
      {isAdmin && (
        <>
          <InvoiceUploaderModal
            isOpen={invoiceUploaderOpen}
            onClose={() => setInvoiceUploaderOpen(false)}
            onParsed={(data) => {
              setParsedInvoiceData(data);
              setInvoiceReviewOpen(true);
            }}
          />
          <InvoiceReviewModal
            isOpen={invoiceReviewOpen}
            onClose={() => setInvoiceReviewOpen(false)}
            parsedData={parsedInvoiceData}
            onConfirmed={handleInvoiceConfirmed}
          />
        </>
      )}
    </div>
  );
};
