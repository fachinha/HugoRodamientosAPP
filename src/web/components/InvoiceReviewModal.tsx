import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  TrendingUp,
  TrendingDown,
  Search,
  Building2,
  Calendar,
  FileCheck2,
  Hash,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { formatARS } from '../../shared/money';
import type {
  InvoiceParsedHeader,
  InvoiceMatchedItem,
  InvoiceConfirmRequest,
} from '../../shared/schemas';

interface InvoiceReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  parsedData: {
    invoice: InvoiceParsedHeader;
    items: InvoiceMatchedItem[];
    existingInvoiceWarning?: string | null;
  } | null;
  onConfirmed: (result: any) => void;
}

export const InvoiceReviewModal: React.FC<InvoiceReviewModalProps> = ({
  isOpen,
  onClose,
  parsedData,
  onConfirmed,
}) => {
  if (!isOpen || !parsedData) return null;

  const { invoice, existingInvoiceWarning } = parsedData;
  const [items, setItems] = useState<InvoiceMatchedItem[]>(parsedData.items);
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState<'all' | 'matched' | 'new' | 'skipped'>('all');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados para búsqueda de reasignación manual
  const [searchingRowId, setSearchingRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const handleSearchProduct = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await apiFetch<any>(`/products?q=${encodeURIComponent(query)}&pageSize=5`);
      setSearchResults(res.items || []);
    } catch {
      setSearchResults([]);
    }
  };

  const handleSelectProductForRow = (rowId: string, product: any) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        const curCost = product.cost_cents || 0;
        let diffPct: number | null = null;
        if (curCost > 0 && it.netUnitCostCents > 0) {
          diffPct = Math.round(((it.netUnitCostCents - curCost) / curCost) * 1000) / 10;
        }

        let suggPrice = product.price_cents;
        if (curCost > 0 && product.price_cents > curCost && it.netUnitCostCents > 0) {
          suggPrice = Math.round(it.netUnitCostCents * (product.price_cents / curCost));
        } else if (it.netUnitCostCents > 0) {
          suggPrice = Math.round(it.netUnitCostCents * 1.5);
        }

        return {
          ...it,
          matchType: 'alias',
          action: 'update_stock',
          matchedProductId: product.id,
          matchedProductSku: product.sku,
          matchedProductName: product.name,
          currentStock: product.stock,
          currentCostCents: product.cost_cents,
          currentPriceCents: product.price_cents,
          costDiffPercent: diffPct,
          suggestedPriceCents: suggPrice,
          updatePrice: false,
          saveAlias: true,
        };
      }),
    );
    setSearchingRowId(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleUpdateItem = (id: string, updates: Partial<InvoiceMatchedItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...updates } : it)));
  };

  const toggleSkipItem = (id: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (it.action === 'skip') {
          return {
            ...it,
            action: it.matchedProductId ? 'update_stock' : 'create_and_stock',
          };
        }
        return { ...it, action: 'skip' };
      }),
    );
  };

  const filteredItems = items.filter((it) => {
    if (filter === 'matched') return it.action === 'update_stock';
    if (filter === 'new') return it.action === 'create_and_stock';
    if (filter === 'skipped') return it.action === 'skip';
    return true;
  });

  const validItems = items.filter((it) => it.action !== 'skip');
  const totalUnits = validItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
  const updatedCount = validItems.filter((it) => it.action === 'update_stock').length;
  const createdCount = validItems.filter((it) => it.action === 'create_and_stock').length;

  const handleConfirm = async () => {
    if (validItems.length === 0) {
      setErrorMsg('Debes incluir al menos un artículo para ingresar al inventario.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const idempotencyKey = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const payload: InvoiceConfirmRequest = {
      idempotencyKey,
      supplierName: invoice.supplierName,
      supplierCuit: invoice.supplierCuit,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      subtotalCents: invoice.subtotalNetCents,
      taxCents: invoice.taxCents,
      totalCents: invoice.totalCents,
      notes: notes.trim() || undefined,
      items: validItems.map((it) => ({
        action: it.action,
        supplierCode: it.supplierCode,
        quantity: it.quantity,
        netUnitCostCents: it.netUnitCostCents,
        productId: it.matchedProductId || undefined,
        newProduct:
          it.action === 'create_and_stock'
            ? {
                sku: (it.newSku || it.supplierCode).trim(),
                name: (it.newName || it.description).trim(),
                brand: it.newBrand?.trim() || it.brand?.trim() || undefined,
                priceCents: it.newPriceCents || it.suggestedPriceCents || Math.round(it.netUnitCostCents * 1.5),
                costCents: it.netUnitCostCents,
              }
            : undefined,
        updatePrice: it.updatePrice,
        newPriceCents: it.newPriceCents || it.suggestedPriceCents || undefined,
        saveAlias: it.saveAlias,
      })),
    };

    try {
      const res = await apiFetch<any>('/invoices/confirm', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      onConfirmed(res);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al confirmar la factura.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-6xl w-full flex flex-col max-h-[92vh] overflow-hidden">
        {/* Cabecera */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-100 text-orange-600 rounded-xl">
              <FileCheck2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Revisión y Homologación de Factura</h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800">
                  {invoice.items.length} artículos leídos
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Verificá las equivalencias con tu catálogo antes de actualizar el stock y costos.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info del comprobante */}
        <div className="p-4 bg-white border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
            <div className="truncate">
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Proveedor</p>
              <p className="font-bold text-slate-900 truncate">{invoice.supplierName}</p>
              {invoice.supplierCuit && (
                <p className="text-[10px] text-slate-500 font-mono">CUIT: {invoice.supplierCuit}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-slate-400 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Comprobante</p>
              <p className="font-bold text-slate-900 font-mono">
                Factura {invoice.invoiceType} {invoice.invoiceNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Fecha de Emisión</p>
              <p className="font-bold text-slate-900">{invoice.invoiceDate}</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 text-right">
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Comprobante</p>
              <p className="font-extrabold text-slate-900 text-sm font-mono">
                {formatARS(invoice.totalCents)}
              </p>
              {invoice.subtotalNetCents > 0 && (
                <p className="text-[10px] text-slate-500 font-mono">
                  Neto: {formatARS(invoice.subtotalNetCents)}
                </p>
              )}
            </div>
          </div>
        </div>

        {existingInvoiceWarning && (
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>{existingInvoiceWarning}</span>
          </div>
        )}

        {errorMsg && (
          <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Barra de filtros */}
        <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                filter === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              Todos ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('matched')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                filter === 'matched' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              Coincidentes ({items.filter((it) => it.action === 'update_stock').length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('new')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                filter === 'new' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              Nuevos a crear ({items.filter((it) => it.action === 'create_and_stock').length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('skipped')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                filter === 'skipped' ? 'bg-slate-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              Omitidos ({items.filter((it) => it.action === 'skip').length})
            </button>
          </div>

          <div className="text-[11px] text-slate-500">
            Piezas a ingresar: <span className="font-bold text-slate-900">{totalUnits} un.</span>
          </div>
        </div>

        {/* Tabla de ítems con scroll */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold sticky top-0 border-b border-slate-200 z-10">
              <tr>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5">Artículo Proveedor</th>
                <th className="px-3 py-2.5">Catálogo Hugo</th>
                <th className="px-3 py-2.5 text-center">Cant.</th>
                <th className="px-3 py-2.5 text-right">Costo Neto</th>
                <th className="px-3 py-2.5">Precio Venta</th>
                <th className="px-3 py-2.5 text-center">Recordar</th>
                <th className="px-3 py-2.5 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item) => {
                const isSkipped = item.action === 'skip';

                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      isSkipped ? 'opacity-40 bg-slate-50/30' : ''
                    }`}
                  >
                    {/* Badge de estado */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {isSkipped ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                          Omitido
                        </span>
                      ) : item.matchType === 'exact_sku' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          SKU Exacto
                        </span>
                      ) : item.matchType === 'alias' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                          Alias Previo
                        </span>
                      ) : item.matchType === 'barcode' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">
                          Cód. Barras
                        </span>
                      ) : item.matchType === 'fuzzy' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                          Sugerido
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                          Nuevo
                        </span>
                      )}
                    </td>

                    {/* Código y descripción del proveedor */}
                    <td className="px-3 py-2.5 max-w-[200px]">
                      <p className="font-mono font-bold text-slate-900">{item.supplierCode}</p>
                      <p className="text-[11px] text-slate-600 truncate">{item.description}</p>
                      {item.brand && <p className="text-[10px] text-slate-400 uppercase font-semibold">{item.brand}</p>}
                    </td>

                    {/* Catálogo de Hugo (Mapeo o nuevo producto) */}
                    <td className="px-3 py-2.5 min-w-[220px]">
                      {item.action === 'create_and_stock' ? (
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={item.newSku || item.supplierCode}
                            onChange={(e) => handleUpdateItem(item.id, { newSku: e.target.value })}
                            placeholder="SKU a crear..."
                            className="w-full px-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded bg-blue-50/40"
                          />
                          <input
                            type="text"
                            value={item.newName || item.description}
                            onChange={(e) => handleUpdateItem(item.id, { newName: e.target.value })}
                            placeholder="Nombre comercial..."
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                          />
                        </div>
                      ) : item.matchedProductName ? (
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-slate-800">{item.matchedProductSku}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Stock act: {item.currentStock}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 truncate">{item.matchedProductName}</p>

                          {searchingRowId === item.id ? (
                            <div className="mt-1 relative">
                              <input
                                type="text"
                                autoFocus
                                value={searchQuery}
                                onChange={(e) => handleSearchProduct(e.target.value)}
                                placeholder="Buscar otro producto..."
                                className="w-full px-2 py-1 text-xs border border-orange-400 rounded"
                              />
                              {searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-36 overflow-y-auto">
                                  {searchResults.map((p) => (
                                    <div
                                      key={p.id}
                                      onClick={() => handleSelectProductForRow(item.id, p)}
                                      className="p-1.5 hover:bg-slate-50 cursor-pointer text-[11px]"
                                    >
                                      <p className="font-bold">{p.name}</p>
                                      <p className="text-[10px] font-mono text-slate-400">SKU: {p.sku}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchingRowId(item.id);
                                setSearchQuery('');
                                setSearchResults([]);
                              }}
                              className="text-[10px] text-orange-600 hover:underline cursor-pointer"
                            >
                              Cambiar asignación
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSearchingRowId(item.id)}
                          className="text-xs text-orange-600 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Search className="h-3 w-3" />
                          <span>Buscar en catálogo</span>
                        </button>
                      )}
                    </td>

                    {/* Cantidad */}
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <input
                        type="number"
                        min="1"
                        disabled={isSkipped}
                        value={item.quantity}
                        onChange={(e) =>
                          handleUpdateItem(item.id, { quantity: parseInt(e.target.value) || 1 })
                        }
                        className="w-16 px-1.5 py-1 text-center font-bold text-slate-900 border border-slate-300 rounded text-xs"
                      />
                    </td>

                    {/* Costo neto */}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <p className="font-mono font-bold text-slate-900">
                        {formatARS(item.netUnitCostCents)}
                      </p>
                      {item.costDiffPercent !== null && item.costDiffPercent !== 0 && (
                        <div
                          className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded ${
                            item.costDiffPercent > 0
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {item.costDiffPercent > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          <span>
                            {item.costDiffPercent > 0 ? `+${item.costDiffPercent}%` : `${item.costDiffPercent}%`}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Precio de venta */}
                    <td className="px-3 py-2.5 min-w-[140px]">
                      {item.action === 'create_and_stock' ? (
                        <div>
                          <input
                            type="number"
                            min="0"
                            value={(item.newPriceCents || item.suggestedPriceCents || 0) / 100}
                            onChange={(e) =>
                              handleUpdateItem(item.id, {
                                newPriceCents: Math.round(parseFloat(e.target.value || '0') * 100),
                              })
                            }
                            placeholder="Precio público..."
                            className="w-24 px-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded"
                          />
                          <p className="text-[10px] text-slate-400">Margen ~50%</p>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                            <input
                              type="checkbox"
                              checked={item.updatePrice}
                              onChange={(e) =>
                                handleUpdateItem(item.id, { updatePrice: e.target.checked })
                              }
                              className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                            <span>Actualizar precio</span>
                          </label>
                          {item.updatePrice && (
                            <input
                              type="number"
                              min="0"
                              value={(item.newPriceCents || item.suggestedPriceCents || 0) / 100}
                              onChange={(e) =>
                                handleUpdateItem(item.id, {
                                  newPriceCents: Math.round(parseFloat(e.target.value || '0') * 100),
                                })
                              }
                              className="w-24 px-1.5 py-0.5 text-xs font-mono font-bold border border-slate-300 rounded"
                            />
                          )}
                        </div>
                      )}
                    </td>

                    {/* Guardar Alias */}
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={item.saveAlias}
                        disabled={isSkipped || item.matchType === 'exact_sku'}
                        onChange={(e) => handleUpdateItem(item.id, { saveAlias: e.target.checked })}
                        className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                      />
                    </td>

                    {/* Alternar omitir */}
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleSkipItem(item.id)}
                        className={`text-[11px] font-semibold px-2 py-1 rounded cursor-pointer ${
                          isSkipped
                            ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                            : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                        }`}
                      >
                        {isSkipped ? 'Incluir' : 'Omitir'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas opcionales (ej: pedido Mauro remito transporte)..."
              className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs bg-white"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-xs">
              <span className="font-bold text-slate-900">{totalUnits} piezas</span> a ingresar (
              <span className="text-emerald-700 font-semibold">{updatedCount} exist.</span>,{' '}
              <span className="text-blue-700 font-semibold">{createdCount} nuevos</span>)
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 hover:bg-white rounded-xl text-xs font-medium text-slate-700 cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={validItems.length === 0 || submitting}
              onClick={handleConfirm}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Impactando stock...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Confirmar Ingreso de Stock</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
