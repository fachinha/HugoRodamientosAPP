import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Check,
  Printer,
  X,
  CreditCard,
  Percent,
  Search,
  AlertTriangle,
  RotateCcw,
  Loader2,
  FileText,
} from 'lucide-react';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { apiFetch, ApiClientError } from '../api/client';
import { formatARS } from '../../shared/money';
import { formatDateTime } from '../../shared/time';
import { useAuth } from '../context/AuthContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import type { SaleDetail } from '../../worker/services/sales.service';

interface CartItem {
  productId: number;
  sku: string;
  name: string;
  brand: string | null;
  unit: string;
  unitPriceCents: number;
  quantity: number;
  availableStock: number;
}

export const PosPage: React.FC = () => {
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('rh_pos_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [paymentMethods, setPaymentMethods] = useState<{ id: number; name: string; active: boolean }[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<number>(1);
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<SaleDetail | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal de búsqueda manual
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Configuración de descuento máximo para vendedor
  const [maxSellerDiscount, setMaxSellerDiscount] = useState<number>(0);

  useEffect(() => {
    sessionStorage.setItem('rh_pos_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    // Cargar medios de pago y configuración
    apiFetch<any[]>('/payment-methods').then((res) => {
      const active = res.filter((m) => m.active);
      setPaymentMethods(active);
      if (active.length > 0) setSelectedPaymentMethodId(active[0].id);
    });

    apiFetch<any>('/settings').then((s) => {
      setMaxSellerDiscount(s.maxSellerDiscountPct ?? 0);
    });
  }, []);

  const handleScanCode = async (code: string) => {
    setErrorMessage(null);
    try {
      const res = await apiFetch<{ found: boolean; product: any }>(`/products/by-code/${encodeURIComponent(code)}`);
      if (!res.found || !res.product) {
        return false;
      }
      addToCart(res.product);
      return true;
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al buscar producto por código.');
      return false;
    }
  };

  const addToCart = (product: any) => {
    if (product.stock <= 0) {
      setErrorMessage(`No hay stock disponible para "${product.name}" (${product.sku}).`);
      return;
    }

    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.productId === product.id);
      if (existingIdx >= 0) {
        const item = prev[existingIdx];
        if (item.quantity + 1 > product.stock) {
          setErrorMessage(`No podés agregar más de ${product.stock} unidad(es) de "${product.name}".`);
          return prev;
        }
        const updated = [...prev];
        updated[existingIdx] = { ...item, quantity: item.quantity + 1, availableStock: product.stock };
        return updated;
      }

      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          brand: product.brand,
          unit: product.unit || 'unidad',
          unitPriceCents: product.priceCents,
          quantity: 1,
          availableStock: product.stock,
        },
      ];
    });
  };

  const updateQuantity = (productId: number, newQty: number) => {
    if (newQty <= 0) {
      removeItem(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          if (newQty > item.availableStock) {
            setErrorMessage(`Stock disponible alcanzado (${item.availableStock}) para "${item.name}".`);
            return { ...item, quantity: item.availableStock };
          }
          return { ...item, quantity: newQty };
        }
        return item;
      }),
    );
  };

  const removeItem = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountPct(0);
    setNotes('');
    setErrorMessage(null);
  };

  // Cálculos de la venta
  const subtotalCents = cart.reduce((acc, item) => acc + item.unitPriceCents * item.quantity, 0);
  const discountCents = Math.round((subtotalCents * discountPct) / 100);
  const totalCents = Math.max(0, subtotalCents - discountCents);

  // Validación de descuento
  const isDiscountAllowed = user?.role === 'admin' || discountPct <= maxSellerDiscount;

  const handleConfirmSale = async () => {
    if (cart.length === 0) return;
    if (!isOnline) {
      setErrorMessage('Sin conexión a internet. No se puede confirmar la venta para evitar sobreventas.');
      return;
    }
    if (!isDiscountAllowed) {
      setErrorMessage(`El descuento supera el máximo autorizado para vendedores (${maxSellerDiscount}%).`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    // Clave de idempotencia única para este intento de venta
    const idempotencyKey = `sale_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const sale = await apiFetch<SaleDetail>('/sales', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey,
          paymentMethodId: selectedPaymentMethodId,
          discountCents,
          notes: notes.trim() || undefined,
          items: cart.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            expectedUnitPriceCents: i.unitPriceCents,
          })),
        }),
      });

      setLastSale(sale);
      setReceiptOpen(true);
      clearCart();
    } catch (err: any) {
      if (err instanceof ApiClientError && err.code === 'INSUFFICIENT_STOCK') {
        setErrorMessage(err.message);
      } else if (err instanceof ApiClientError && err.code === 'PRICE_CHANGED') {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(err.message || 'Error al confirmar la venta.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Búsqueda manual
  const handleManualSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await apiFetch<any>(`/products?q=${encodeURIComponent(searchQuery)}&pageSize=10`);
      setSearchResults(res.items || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Barra superior de lectura rápida */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-3 no-print">
        <div className="flex-1 w-full">
          <BarcodeScanner
            onScan={handleScanCode}
            placeholder="Pistola de código de barras lista: escaneá o escribí el código/SKU..."
            autoFocus
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setSearchQuery('');
            setSearchResults([]);
            setSearchModalOpen(true);
          }}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        >
          <Search className="h-4 w-4" />
          <span>Buscar en catálogo</span>
        </button>
      </div>

      {/* Alerta de error si ocurrió */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
          <button type="button" onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Estructura dividida: Carrito a la izquierda, Totales y Cobro a la derecha */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start no-print">
        {/* Carrito de Compras (2 columnas) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col min-h-[460px]">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Artículos en la venta actual ({cart.reduce((a, b) => a + b.quantity, 0)})
              </h3>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs text-rose-600 hover:text-rose-800 font-medium flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Vaciar carrito</span>
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400 text-center">
              <ShoppingCart className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-600">El carrito de venta está vacío</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Escaneá un código de barras con la pistola o buscá productos por SKU o nombre para agregarlos al mostrador.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Descripción</th>
                    <th className="px-4 py-3 text-right">Precio unitario</th>
                    <th className="px-4 py-3 text-center w-32">Cantidad</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                    <th className="px-4 py-3 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cart.map((item) => (
                    <tr key={item.productId} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {item.sku}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{item.name}</p>
                        {item.brand && <p className="text-[10px] text-slate-400">{item.brand}</p>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-medium text-slate-900">
                        {formatARS(item.unitPriceCents)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            className="p-1 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={item.availableStock}
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 1)}
                            className="w-12 text-center text-xs font-bold bg-white text-slate-900 border-x border-slate-200 py-0.5 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            disabled={item.quantity >= item.availableStock}
                            className="p-1 hover:bg-slate-200 disabled:opacity-40 text-slate-600 transition-colors cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">Stock: {item.availableStock}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatARS(item.unitPriceCents * item.quantity)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(item.productId)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          title="Quitar artículo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel de Cobro y Totales (1 columna) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-5">
          <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-200">
            Resumen de operación
          </h3>

          {/* Subtotal */}
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Subtotal ({cart.length} ítems)</span>
            <span className="font-semibold text-slate-900">{formatARS(subtotalCents)}</span>
          </div>

          {/* Descuento */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1">
                <Percent className="h-3.5 w-3.5 text-slate-400" />
                <span>Descuento aplicado</span>
              </span>
              {discountCents > 0 && (
                <span className="text-emerald-700 font-semibold">− {formatARS(discountCents)}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max={user?.role === 'admin' ? 100 : maxSellerDiscount}
                value={discountPct}
                onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                placeholder="0"
                className="w-20 px-2 py-1.5 border border-slate-300 rounded-md text-xs text-center font-bold text-slate-900"
              />
              <span className="text-xs text-slate-500 font-medium">%</span>
              {user?.role !== 'admin' && (
                <span className="text-[10px] text-slate-400 leading-tight">
                  (Máx. vendedor: {maxSellerDiscount}%)
                </span>
              )}
            </div>
          </div>

          {/* Total Destacado */}
          <div className="p-4 bg-slate-900 text-white rounded-xl shadow-xs space-y-1">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">Total a cobrar</p>
            <p className="text-3xl font-extrabold tracking-tight text-white">{formatARS(totalCents)}</p>
          </div>

          {/* Medio de Pago */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">Medio de pago</label>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setSelectedPaymentMethodId(pm.id)}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer ${
                    selectedPaymentMethodId === pm.id
                      ? 'bg-sky-50 border-sky-600 text-sky-800 ring-1 ring-sky-600'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {pm.name}
                </button>
              ))}
            </div>
          </div>

          {/* Observaciones opcionales */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Observaciones (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Cliente retira por mostrador..."
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs text-slate-800"
            />
          </div>

          {/* Botón de Confirmar Venta */}
          <button
            type="button"
            onClick={handleConfirmSale}
            disabled={cart.length === 0 || isSubmitting || !isOnline}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Registrando venta...</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>Confirmar venta y descontar stock</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Modal de Búsqueda Manual */}
      {searchModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h4 className="text-base font-bold text-slate-900">Buscar producto para el carrito</h4>
              <button
                type="button"
                onClick={() => setSearchModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                placeholder="Escribí nombre, SKU o marca..."
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={handleManualSearch}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {searchResults.length === 0 && searchQuery && !searching ? (
                <p className="text-xs text-slate-400 text-center py-6">No se encontraron productos coincidentes.</p>
              ) : (
                searchResults.map((prod) => (
                  <div key={prod.id} className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded">
                    <div>
                      <p className="font-semibold text-xs text-slate-900">{prod.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        SKU: {prod.sku} {prod.brand ? `· ${prod.brand}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-bold text-xs text-slate-900">{formatARS(prod.priceCents)}</p>
                        <p className={`text-[10px] font-semibold ${prod.stock > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          Stock: {prod.stock}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={prod.stock <= 0}
                        onClick={() => {
                          addToCart(prod);
                          setSearchModalOpen(false);
                        }}
                        className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 text-white text-xs font-semibold rounded cursor-pointer"
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Comprobante Interno de Venta (imprimible) */}
      {receiptOpen && lastSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-5 print:p-0 print:border-none print:shadow-none">
            {/* Cabecera del comprobante */}
            <div className="text-center pb-4 border-b border-slate-200">
              <h3 className="font-bold text-lg text-slate-900">Rodamientos Hugo</h3>
              <p className="text-xs text-slate-500">Bariloche · Río Negro</p>
              <p className="text-[11px] text-slate-400 mt-0.5">COMPROBANTE INTERNO DE VENTA</p>
              <div className="mt-2 text-xs font-mono font-bold text-sky-800 bg-sky-50 py-1 px-2 rounded inline-block">
                N° {lastSale.saleNumber}
              </div>
            </div>

            {/* Metadatos */}
            <div className="text-xs space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>Fecha:</span>
                <span className="font-medium text-slate-900">{formatDateTime(lastSale.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span>Atendido por:</span>
                <span className="font-medium text-slate-900">{lastSale.userName}</span>
              </div>
              <div className="flex justify-between">
                <span>Medio de pago:</span>
                <span className="font-medium text-slate-900">{lastSale.paymentMethodName}</span>
              </div>
              {lastSale.notes && (
                <div className="flex justify-between">
                  <span>Nota:</span>
                  <span className="font-medium text-slate-900">{lastSale.notes}</span>
                </div>
              )}
            </div>

            {/* Artículos vendidos */}
            <div className="border-t border-b border-slate-200 py-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 text-[10px] uppercase font-semibold">
                    <th className="text-left pb-1">Artículo</th>
                    <th className="text-center pb-1">Cant.</th>
                    <th className="text-right pb-1">P. Unit</th>
                    <th className="text-right pb-1">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lastSale.items.map((it) => (
                    <tr key={it.id}>
                      <td className="py-1 pr-2">
                        <p className="font-medium text-slate-900 truncate max-w-[150px]">{it.name}</p>
                        <p className="text-[10px] font-mono text-slate-400">{it.sku}</p>
                      </td>
                      <td className="text-center py-1 font-semibold">{it.quantity}</td>
                      <td className="text-right py-1 text-slate-600 whitespace-nowrap">{formatARS(it.unitPriceCents)}</td>
                      <td className="text-right py-1 font-bold text-slate-900 whitespace-nowrap">{formatARS(it.lineTotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totales */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatARS(lastSale.subtotalCents)}</span>
              </div>
              {lastSale.discountCents > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Descuento</span>
                  <span>− {formatARS(lastSale.discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>TOTAL</span>
                <span>{formatARS(lastSale.totalCents)}</span>
              </div>
            </div>

            {/* Pie de comprobante */}
            <div className="text-center text-[10px] text-slate-400 italic pt-2">
              Comprobante interno sin validez fiscal. Guardá este ticket para reclamos o cambios.
            </div>

            {/* Acciones del comprobante */}
            <div className="flex gap-2 pt-2 no-print">
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>Imprimir ticket</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptOpen(false)}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Nueva venta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
