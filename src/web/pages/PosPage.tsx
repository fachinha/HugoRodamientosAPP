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
  MapPin,
  Ruler,
  DollarSign,
  Calculator,
  Edit2,
  ChevronDown,
  Calendar,
  Clock,
  Eye,
} from 'lucide-react';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { apiFetch, ApiClientError } from '../api/client';
import { formatARS } from '../../shared/money';
import { formatDateTime } from '../../shared/time';
import { useAuth } from '../context/AuthContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Logo } from '../components/Logo';
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
  location?: string | null;
  dimensions?: string | null;
  isManual?: boolean;
  manualReason?: string | null;
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

  // Pestaña activa en POS: 'pos' (Mostrador) | 'cash_register' (Caja del Día / Seguimiento Diario)
  const [activePosTab, setActivePosTab] = useState<'pos' | 'cash_register'>('pos');

  // Estado de Caja del Día (Seguimiento diario de facturación)
  const todayIsoDate = new Date().toISOString().slice(0, 10);
  const [cashDateFilter, setCashDateFilter] = useState<string>(todayIsoDate);
  const [dailySales, setDailySales] = useState<SaleDetail[]>([]);
  const [loadingDailySales, setLoadingDailySales] = useState<boolean>(false);

  // Cuotas, Tipo (Débito / Crédito), Marca (Visa / Mastercard) y Recargo por Tarjeta
  const [cardType, setCardType] = useState<'debito' | 'credito'>('debito');
  const [cardBrand, setCardBrand] = useState<string>('Visa');
  const [installments, setInstallments] = useState<number>(1);
  const [surchargePct, setSurchargePct] = useState<number>(0);
  const [customSurchargePct, setCustomSurchargePct] = useState<string>('0');

  // Tipo de cambio USD (Dólar Blue en vivo o manual) y calculadora de vuelto en divisas
  const [exchangeRateUsd, setExchangeRateUsd] = useState<number>(1575);
  const [buyRateUsd, setBuyRateUsd] = useState<number>(1555);
  const [rateMode, setRateMode] = useState<'auto' | 'manual'>('auto');
  const [isEditingExchangeRate, setIsEditingExchangeRate] = useState<boolean>(false);
  const [tempExchangeRate, setTempExchangeRate] = useState<string>('1575');
  const [usdCashReceived, setUsdCashReceived] = useState<string>('');

  // Búsqueda predictiva en tiempo real (por descripción, medidas, SKU, marca)
  const [predictiveQuery, setPredictiveQuery] = useState('');
  const [predictiveResults, setPredictiveResults] = useState<any[]>([]);
  const [predictiveLoading, setPredictiveLoading] = useState(false);
  const [showPredictiveDropdown, setShowPredictiveDropdown] = useState(false);
  const predictiveContainerRef = useRef<HTMLDivElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<SaleDetail | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Configuración de descuento máximo para vendedor (por defecto 5%) y autorización de supervisor
  const [maxSellerDiscount, setMaxSellerDiscount] = useState<number>(5);
  const [supervisorAuthorized, setSupervisorAuthorized] = useState<boolean>(false);
  const [supervisorAuthorizedBy, setSupervisorAuthorizedBy] = useState<string>('');
  const [showSupervisorModal, setShowSupervisorModal] = useState<boolean>(false);
  const [tempSupervisorName, setTempSupervisorName] = useState<string>('Supervisor de Ventas');

  // Carga manual de productos que no están en catálogo (ej. Retén de palier / solo en MercadoLibre)
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [manualDescription, setManualDescription] = useState<string>('');
  const [manualBrand, setManualBrand] = useState<string>('');
  const [manualPriceStr, setManualPriceStr] = useState<string>('');
  const [manualQty, setManualQty] = useState<number>(1);
  const [manualReason, setManualReason] = useState<string>('Solo lo tiene MercadoLibre');

  useEffect(() => {
    sessionStorage.setItem('rh_pos_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    const handleCartSync = () => {
      try {
        const saved = sessionStorage.getItem('rh_pos_cart');
        if (saved) {
          setCart(JSON.parse(saved));
        }
      } catch {}
    };
    window.addEventListener('rh_cart_updated', handleCartSync);
    return () => window.removeEventListener('rh_cart_updated', handleCartSync);
  }, []);

  useEffect(() => {
    // Cargar medios de pago, configuración y tipo de cambio
    apiFetch<any[]>('/payment-methods').then((res) => {
      const active = res.filter((m) => m.active);
      setPaymentMethods(active);
      if (active.length > 0) setSelectedPaymentMethodId(active[0].id);
    });

    apiFetch<any>('/settings').then((s) => {
      setMaxSellerDiscount(s.maxSellerDiscountPct ?? 5);
    });

    apiFetch<{ rate: number; buyRate?: number; mode?: 'auto' | 'manual' }>('/settings/exchange-rate')
      .then((res) => {
        if (res?.rate) {
          setExchangeRateUsd(res.rate);
          setBuyRateUsd(res.buyRate ?? res.rate);
          setRateMode(res.mode ?? 'auto');
          setTempExchangeRate(String(res.rate));
        }
      })
      .catch(() => {});

    const handleRateSync = (e: Event) => {
      const custom = e as CustomEvent<{ rate: number; buyRate?: number; mode?: 'auto' | 'manual' }>;
      if (custom.detail?.rate) {
        setExchangeRateUsd(custom.detail.rate);
        if (custom.detail.buyRate) setBuyRateUsd(custom.detail.buyRate);
        if (custom.detail.mode) setRateMode(custom.detail.mode);
        setTempExchangeRate(String(custom.detail.rate));
      }
    };
    window.addEventListener('rh_exchange_rate_updated', handleRateSync);
    return () => window.removeEventListener('rh_exchange_rate_updated', handleRateSync);
  }, []);

  const fetchDailySales = async (dateStr = cashDateFilter) => {
    setLoadingDailySales(true);
    try {
      const params = new URLSearchParams({
        from: dateStr,
        to: dateStr,
        pageSize: '100',
      });
      const res = await apiFetch<{ items: SaleDetail[] }>(`/sales?${params.toString()}`);
      setDailySales(res.items || []);
    } catch {
      setDailySales([]);
    } finally {
      setLoadingDailySales(false);
    }
  };

  useEffect(() => {
    if (activePosTab === 'cash_register') {
      fetchDailySales(cashDateFilter);
    }
  }, [activePosTab, cashDateFilter]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        predictiveContainerRef.current &&
        !predictiveContainerRef.current.contains(e.target as Node)
      ) {
        setShowPredictiveDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounce para búsqueda predictiva en tiempo real
  useEffect(() => {
    if (!predictiveQuery.trim()) {
      setPredictiveResults([]);
      setShowPredictiveDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setPredictiveLoading(true);
      try {
        const res = await apiFetch<any>(
          `/products?q=${encodeURIComponent(predictiveQuery.trim())}&pageSize=8&active=1`
        );
        setPredictiveResults(res.items || []);
        setShowPredictiveDropdown(true);
      } catch {
        setPredictiveResults([]);
      } finally {
        setPredictiveLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [predictiveQuery]);

  const handleScanCode = async (code: string) => {
    setErrorMessage(null);
    try {
      const res = await apiFetch<{ found: boolean; product: any }>(
        `/products/by-code/${encodeURIComponent(code)}`
      );
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
          location: product.location || null,
          dimensions: product.dimensions || null,
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
      })
    );
  };

  const removeItem = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountPct(0);
    setSupervisorAuthorized(false);
    setSupervisorAuthorizedBy('');
    setInstallments(1);
    setSurchargePct(0);
    setNotes('');
    setErrorMessage(null);
    setUsdCashReceived('');
  };

  const handleAddManualItem = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const desc = manualDescription.trim();
    const reason = manualReason.trim();
    const priceNum = parseFloat(manualPriceStr.replace(',', '.'));

    if (desc.length < 2) {
      setErrorMessage('Ingresá la descripción del producto manual (ej: Retén de palier).');
      return;
    }
    if (reason.length < 3) {
      setErrorMessage('Es obligatorio indicar el motivo por el que se carga manual (ej: Solo lo tiene MercadoLibre).');
      return;
    }
    if (isNaN(priceNum) || priceNum <= 0) {
      setErrorMessage('Ingresá un precio unitario válido mayor a $0.');
      return;
    }

    const tempManualId = -Math.floor(Date.now() % 1000000);
    const priceCents = Math.round(priceNum * 100);

    setCart((prev) => [
      ...prev,
      {
        productId: tempManualId,
        sku: 'MANUAL',
        name: desc,
        brand: manualBrand.trim() || null,
        unit: 'unidad',
        unitPriceCents: priceCents,
        quantity: Math.max(1, manualQty),
        availableStock: 999,
        location: 'CARGA MANUAL',
        dimensions: null,
        isManual: true,
        manualReason: reason,
      },
    ]);

    setManualDescription('');
    setManualBrand('');
    setManualPriceStr('');
    setManualQty(1);
    setShowManualModal(false);
  };

  // Identificar medio de pago seleccionado
  const selectedPaymentMethod = paymentMethods.find((pm) => pm.id === selectedPaymentMethodId);
  const isCard =
    selectedPaymentMethod?.name.toLowerCase().includes('tarjeta') ||
    selectedPaymentMethod?.name.toLowerCase().includes('crédito') ||
    selectedPaymentMethod?.name.toLowerCase().includes('credito') ||
    selectedPaymentMethod?.name.toLowerCase().includes('debito') ||
    selectedPaymentMethod?.name.toLowerCase().includes('débito');

  const isUsdPayment =
    selectedPaymentMethod?.name.toLowerCase().includes('dólar') ||
    selectedPaymentMethod?.name.toLowerCase().includes('dolar');

  // Manejo de cuotas y recargos
  const handleSelectInstallments = (cuotas: number, recargo: number) => {
    setInstallments(cuotas);
    setSurchargePct(recargo);
    setCustomSurchargePct(String(recargo));
  };

  const handleCustomSurchargeChange = (valStr: string) => {
    setCustomSurchargePct(valStr);
    const n = parseFloat(valStr);
    setSurchargePct(isNaN(n) || n < 0 ? 0 : n);
  };

  // Cálculos de la venta
  const subtotalCents = cart.reduce((acc, item) => acc + item.unitPriceCents * item.quantity, 0);
  const discountCents = Math.round((subtotalCents * discountPct) / 100);
  const taxableBase = Math.max(0, subtotalCents - discountCents);
  const surchargeCents = isCard ? Math.round((taxableBase * surchargePct) / 100) : 0;
  const totalCents = Math.max(0, taxableBase + surchargeCents);

  // Conversión a Dólares
  const totalUsdFloat = exchangeRateUsd > 0 ? totalCents / 100 / exchangeRateUsd : 0;
  const usdCashNum = parseFloat(usdCashReceived);
  const isCashUsdValid = !isNaN(usdCashNum) && usdCashNum > 0;
  const usdCashInArs = isCashUsdValid ? usdCashNum * exchangeRateUsd : 0;
  const changeInArs = isCashUsdValid ? usdCashInArs - totalCents / 100 : null;

  // Validación de descuento (Vendedor hasta 5% o autorizado por Supervisor)
  const isDiscountAllowed =
    user?.role === 'admin' || discountPct <= maxSellerDiscount || supervisorAuthorized;

  const handleConfirmSale = async () => {
    if (cart.length === 0) return;
    if (!isOnline) {
      setErrorMessage('Sin conexión a internet. No se puede confirmar la venta para evitar sobreventas.');
      return;
    }
    if (!isDiscountAllowed) {
      setErrorMessage(`El descuento supera el máximo autorizado para vendedores (${maxSellerDiscount}%). Pedile autorización al Supervisor.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const idempotencyKey = `sale_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const sale = await apiFetch<SaleDetail>('/sales', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey,
          paymentMethodId: selectedPaymentMethodId,
          discountCents,
          surchargeCents,
          installments: isCard ? (cardType === 'debito' ? 1 : installments) : undefined,
          cardType: isCard ? cardType : null,
          cardBrand: isCard ? cardBrand : null,
          exchangeRateUsd,
          supervisorAuthorized,
          supervisorAuthorizedBy: supervisorAuthorized ? supervisorAuthorizedBy : null,
          notes: notes.trim() || undefined,
          items: cart.map((i) =>
            i.isManual
              ? {
                  isManual: true,
                  manualDescription: i.name,
                  manualBrand: i.brand,
                  manualReason: i.manualReason || 'Carga manual en mostrador',
                  quantity: i.quantity,
                  expectedUnitPriceCents: i.unitPriceCents,
                }
              : {
                  productId: i.productId,
                  quantity: i.quantity,
                  expectedUnitPriceCents: i.unitPriceCents,
                },
          ),
        }),
      });

      setLastSale(sale);
      setReceiptOpen(true);
      clearCart();
      if (activePosTab === 'cash_register') {
        fetchDailySales(cashDateFilter);
      }
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

  const handleSaveExchangeRate = async () => {
    const rateNum = parseFloat(tempExchangeRate);
    if (isNaN(rateNum) || rateNum <= 0) return;
    try {
      const res = await apiFetch<{ rate: number; buyRate: number; mode: 'auto' | 'manual' }>(
        '/settings/exchange-rate',
        {
          method: 'POST',
          body: JSON.stringify({ rate: rateNum, mode: 'manual' }),
        }
      );
      setExchangeRateUsd(res.rate);
      setBuyRateUsd(res.buyRate);
      setRateMode(res.mode);
      setIsEditingExchangeRate(false);
      window.dispatchEvent(new CustomEvent('rh_exchange_rate_updated', { detail: res }));
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al actualizar tipo de cambio');
    }
  };

  const handleRestoreAutoBlueRate = async () => {
    try {
      const res = await apiFetch<{ rate: number; buyRate: number; mode: 'auto' | 'manual' }>(
        '/settings/exchange-rate',
        {
          method: 'POST',
          body: JSON.stringify({ mode: 'auto' }),
        }
      );
      setExchangeRateUsd(res.rate);
      setBuyRateUsd(res.buyRate);
      setRateMode(res.mode);
      setTempExchangeRate(String(res.rate));
      setIsEditingExchangeRate(false);
      window.dispatchEvent(new CustomEvent('rh_exchange_rate_updated', { detail: res }));
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al restaurar Dólar Blue automático');
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Encabezado y Pestañas: Mostrador POS vs Caja del Día */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Punto de Venta y Caja Diaria</h2>
          <p className="text-xs text-slate-500">
            Facturación rápida de mostrador, tarjetas Débito/Crédito (Visa, Mastercard) y seguimiento diario de caja.
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-white rounded-xl border border-slate-200 shadow-2xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActivePosTab('pos')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer active:scale-95 ${
              activePosTab === 'pos'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>Cobrar en Mostrador</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePosTab('cash_register')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer active:scale-95 ${
              activePosTab === 'cash_register'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Caja del Día (Seguimiento)</span>
          </button>
        </div>
      </div>

      {activePosTab === 'pos' && (
        <>
          {/* Barra superior de lectura rápida, búsqueda predictiva y carga manual */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center gap-3 no-print">
        {/* Lector de código de barras */}
        <div className="w-full md:w-4/12">
          <BarcodeScanner
            onScan={handleScanCode}
            placeholder="Pistola de código de barras: escaneá aquí..."
            autoFocus
          />
        </div>

        {/* Buscador predictivo en tiempo real con dropdown de ubicación y stock */}
        <div className="w-full md:w-5/12 relative" ref={predictiveContainerRef}>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={predictiveQuery}
              onChange={(e) => setPredictiveQuery(e.target.value)}
              onFocus={() => {
                if (predictiveResults.length > 0) setShowPredictiveDropdown(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && predictiveResults.length > 0) {
                  addToCart(predictiveResults[0]);
                  setPredictiveQuery('');
                  setShowPredictiveDropdown(false);
                }
              }}
              placeholder="Buscar por descripción, medidas (25x52x15), SKU o marca..."
              className="w-full pl-9 pr-9 py-2.5 bg-slate-50 focus:bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium transition-all"
            />
            {predictiveLoading ? (
              <Loader2 className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-orange-600 animate-spin" />
            ) : predictiveQuery ? (
              <button
                type="button"
                onClick={() => {
                  setPredictiveQuery('');
                  setShowPredictiveDropdown(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/* Dropdown de resultados predictivos con ubicación física y stock */}
          {showPredictiveDropdown && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden max-h-80 overflow-y-auto divide-y divide-slate-100">
              {predictiveResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 space-y-2">
                  <p>No se encontraron repuestos en catálogo con "{predictiveQuery}"</p>
                  <button
                    type="button"
                    onClick={() => {
                      setManualDescription(predictiveQuery);
                      setShowPredictiveDropdown(false);
                      setShowManualModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg cursor-pointer active:scale-95 transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Cargar "{predictiveQuery}" como Ítem Manual (con motivo)</span>
                  </button>
                </div>
              ) : (
                predictiveResults.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => {
                      addToCart(prod);
                      setPredictiveQuery('');
                      setShowPredictiveDropdown(false);
                    }}
                    className="p-3 hover:bg-orange-50/60 transition-colors flex items-center justify-between cursor-pointer group"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 group-hover:text-orange-700">
                          {prod.name}
                        </span>
                        {prod.brand && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-medium">
                            {prod.brand}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                        <span>SKU: {prod.sku}</span>
                        {prod.dimensions && (
                          <span className="flex items-center gap-0.5 text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.2 rounded">
                            <Ruler className="h-2.5 w-2.5" />
                            {prod.dimensions}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Ubicación en estantería física */}
                      {prod.location ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs">
                          <MapPin className="h-3 w-3 text-amber-600" />
                          {prod.location}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300 italic">Sin estantería</span>
                      )}

                      {/* Stock */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          prod.stock > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        Stock: {prod.stock}
                      </span>

                      {/* Precio */}
                      {prod.priceCents > 0 ? (
                        <span className="font-bold text-xs text-slate-900 whitespace-nowrap">
                          {formatARS(prod.priceCents)}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 whitespace-nowrap">
                          Sin precio ($0)
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Botón para Carga Manual (productos que no están en catálogo, ej: Retén de palier / MercadoLibre) */}
        <div className="w-full md:w-3/12">
          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            className="w-full py-2.5 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-2xs"
            title="Cargar un producto que no está en el catálogo dejando constancia del motivo (ej: Solo lo tiene MercadoLibre)"
          >
            <Plus className="h-4 w-4 text-amber-700 shrink-0" />
            <span>Ítem Manual (Sin catálogo)</span>
          </button>
        </div>
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
              <ShoppingCart className="h-4 w-4 text-orange-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Artículos en mostrador ({cart.reduce((a, b) => a + b.quantity, 0)})
              </h3>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs text-rose-600 hover:text-rose-800 font-medium flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
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
                Escaneá con la pistola o buscá arriba por descripción, medidas o código para agregarlo.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Descripción y Medidas</th>
                    <th className="px-4 py-3">Ubicación Estantería</th>
                    <th className="px-4 py-3 text-right">P. Unitario</th>
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
                        <div className="flex items-center flex-wrap gap-2 text-[10px] text-slate-400 mt-0.5">
                          {item.brand && <span>{item.brand}</span>}
                          {item.dimensions && (
                            <span className="font-mono text-blue-700 bg-blue-50 px-1 rounded font-semibold">
                              {item.dimensions}
                            </span>
                          )}
                          {item.isManual && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                              CARGA MANUAL · Motivo: {item.manualReason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {item.location ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-amber-50 text-amber-900 border border-amber-200">
                            <MapPin className="h-3 w-3 text-amber-600" />
                            {item.location}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic text-[11px]">Sin estantería</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-medium text-slate-900">
                        {formatARS(item.unitPriceCents)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            className="p-1 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer active:scale-90"
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
                            className="p-1 hover:bg-slate-200 disabled:opacity-40 text-slate-600 transition-colors cursor-pointer active:scale-90"
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
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer active:scale-90"
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
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-200">
            Resumen de cobro
          </h3>

          {/* Subtotal */}
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Subtotal ({cart.length} ítems)</span>
            <span className="font-semibold text-slate-900">{formatARS(subtotalCents)}</span>
          </div>

          {/* Descuento (Tope 5% para vendedor; si necesita más pide autorización al Supervisor) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1">
                <Percent className="h-3.5 w-3.5 text-slate-400" />
                <span>Descuento</span>
              </span>
              {discountCents > 0 && (
                <span className="text-emerald-700 font-semibold">− {formatARS(discountCents)}</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                min="0"
                max="100"
                value={discountPct}
                onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                placeholder="0"
                className="w-20 px-2 py-1.5 border border-slate-300 rounded-md text-xs text-center font-bold text-slate-900"
              />
              <span className="text-xs text-slate-500 font-medium">%</span>
              <span className="text-[10px] text-slate-500 leading-tight">
                (Tope vendedor: {maxSellerDiscount || 5}%)
              </span>
            </div>

            {discountPct > (maxSellerDiscount || 5) && (
              <div
                className={`p-2 rounded-lg border text-[11px] space-y-1.5 ${
                  supervisorAuthorized || user?.role === 'admin'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                {supervisorAuthorized ? (
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      ✓ Descuento {discountPct}% autorizado por {supervisorAuthorizedBy}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSupervisorAuthorized(false);
                        setDiscountPct(maxSellerDiscount || 5);
                      }}
                      className="text-[10px] underline text-emerald-800 cursor-pointer"
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      Supera el {maxSellerDiscount || 5}% de vendedor. Requiere aval del Supervisor.
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSupervisorModal(true)}
                      className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded text-[10px] shrink-0 cursor-pointer active:scale-95 transition-all"
                    >
                      Autorizar Supervisor
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Medio de Pago */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-700">Medio de pago</label>
            <div className="grid grid-cols-2 gap-1.5">
              {paymentMethods.map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setSelectedPaymentMethodId(pm.id)}
                  className={`px-2.5 py-2 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer active:scale-95 ${
                    selectedPaymentMethodId === pm.id
                      ? 'bg-orange-50 border-orange-600 text-orange-950 ring-1 ring-orange-600 font-bold'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {pm.name}
                </button>
              ))}
            </div>
          </div>

          {/* Configuración de Tarjeta: Débito/Crédito, Marca (Visa/Mastercard) y Cuotas */}
          {isCard && (
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs text-amber-950 font-bold">
                <span className="flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-amber-600" />
                  Detalle de Tarjeta
                </span>
                {surchargeCents > 0 && (
                  <span className="text-amber-800 font-bold">+ {formatARS(surchargeCents)}</span>
                )}
              </div>

              {/* 1. Selector Débito vs Crédito */}
              <div className="space-y-1">
                <span className="block text-[11px] font-semibold text-slate-600">Tipo de tarjeta</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCardType('debito');
                      handleSelectInstallments(1, 0);
                    }}
                    className={`py-1.5 px-2 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer active:scale-95 ${
                      cardType === 'debito'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-bold'
                        : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                    }`}
                  >
                    Tarjeta Débito
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardType('credito')}
                    className={`py-1.5 px-2 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer active:scale-95 ${
                      cardType === 'credito'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-bold'
                        : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                    }`}
                  >
                    Tarjeta Crédito
                  </button>
                </div>
              </div>

              {/* 2. Selector de Marca (Visa / Mastercard / Otras) */}
              <div className="space-y-1">
                <span className="block text-[11px] font-semibold text-slate-600">Marca de la tarjeta</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Visa', 'Mastercard', 'Cabal', 'Naranja X', 'Amex', 'Otra'] as const).map((brand) => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => setCardBrand(brand)}
                      className={`py-1.5 px-2 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer active:scale-95 ${
                        cardBrand === brand
                          ? brand === 'Visa'
                            ? 'bg-blue-700 text-white border-blue-700 shadow-2xs font-bold'
                            : brand === 'Mastercard'
                              ? 'bg-orange-600 text-white border-orange-600 shadow-2xs font-bold'
                              : 'bg-amber-600 text-white border-amber-600 shadow-2xs font-bold'
                          : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                      }`}
                    >
                      {brand}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Cuotas e Intereses (cuando es Crédito) */}
              {cardType === 'credito' && (
                <div className="space-y-1.5 pt-1 border-t border-amber-200/70">
                  <span className="block text-[11px] font-semibold text-slate-600">Cuotas e interés</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSelectInstallments(1, 0)}
                      className={`py-1.5 px-2 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer active:scale-95 ${
                        installments === 1 && surchargePct === 0
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs font-bold'
                          : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                      }`}
                    >
                      1 cuota (0%)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectInstallments(3, 15)}
                      className={`py-1.5 px-2 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer active:scale-95 ${
                        installments === 3 && surchargePct === 15
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs font-bold'
                          : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                      }`}
                    >
                      3 cuotas (+15%)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectInstallments(6, 30)}
                      className={`py-1.5 px-2 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer active:scale-95 ${
                        installments === 6 && surchargePct === 30
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs font-bold'
                          : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                      }`}
                    >
                      6 cuotas (+30%)
                    </button>
                  </div>
                </div>
              )}

              {/* Recargo personalizado */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-600">Recargo libre:</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={customSurchargePct}
                  onChange={(e) => handleCustomSurchargeChange(e.target.value)}
                  className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-xs text-center font-bold"
                />
                <span className="text-xs text-slate-500">%</span>
                <span className="text-[10px] text-slate-500 font-medium">
                  ({cardBrand} · {cardType === 'debito' ? 'Débito' : `Crédito ${installments}x`})
                </span>
              </div>
            </div>
          )}

          {/* Widget de Dólares al Cambio (Dólar Blue USD) */}
          <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs text-blue-950 font-bold">
              <div className="flex items-center gap-1.5 flex-wrap">
                <DollarSign className="h-3.5 w-3.5 text-blue-600" />
                <span>
                  Dólar Blue (1 USD = ${exchangeRateUsd.toLocaleString('es-AR')})
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                    rateMode === 'auto'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {rateMode === 'auto' ? 'En vivo' : 'Manual'}
                </span>
              </div>
              {user?.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => setIsEditingExchangeRate(!isEditingExchangeRate)}
                  className="text-[10px] text-blue-600 hover:text-blue-800 underline font-medium cursor-pointer shrink-0"
                >
                  {isEditingExchangeRate ? 'Cancelar' : 'Modificar tasa'}
                </button>
              )}
            </div>

            {rateMode === 'auto' && buyRateUsd > 0 && (
              <div className="text-[10px] text-slate-600 flex items-center justify-between">
                <span>Cotización Dólar Blue (se actualiza sola):</span>
                <span className="font-mono font-semibold text-slate-700">
                  Compra ${buyRateUsd.toLocaleString('es-AR')} / Venta ${exchangeRateUsd.toLocaleString('es-AR')}
                </span>
              </div>
            )}

            {isEditingExchangeRate && (
              <div className="space-y-1.5 p-2 bg-white rounded-lg border border-blue-200">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-600 font-mono">$</span>
                  <input
                    type="number"
                    value={tempExchangeRate}
                    onChange={(e) => setTempExchangeRate(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded text-center font-bold font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleSaveExchangeRate}
                    className="px-2.5 py-1 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 cursor-pointer active:scale-95 transition-all"
                  >
                    Fijar Manual
                  </button>
                </div>
                {rateMode === 'manual' && (
                  <button
                    type="button"
                    onClick={handleRestoreAutoBlueRate}
                    className="w-full py-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded cursor-pointer active:scale-95 transition-all"
                  >
                    Volver a Dólar Blue Automático (En vivo)
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Total en divisas:</span>
              <span className="font-mono font-bold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200">
                US$ {totalUsdFloat.toFixed(2)}
              </span>
            </div>

            {/* Calculadora de vuelto en efectivo USD */}
            <div className="pt-1.5 border-t border-blue-200/60">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600 flex items-center gap-1">
                  <Calculator className="h-3 w-3 text-slate-400" />
                  Dólares recibidos:
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-mono font-bold text-slate-500">US$</span>
                  <input
                    type="number"
                    step="any"
                    value={usdCashReceived}
                    onChange={(e) => setUsdCashReceived(e.target.value)}
                    placeholder="100"
                    className="w-18 px-2 py-1 bg-white border border-slate-300 rounded text-xs text-center font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              {changeInArs !== null && (
                <div className="mt-1.5 p-1.5 bg-emerald-50 border border-emerald-200 rounded text-[11px] flex items-center justify-between text-emerald-800 font-medium">
                  <span>Vuelto a entregar al cliente:</span>
                  <span className="font-bold text-xs">
                    {changeInArs >= 0 ? formatARS(Math.round(changeInArs * 100)) : 'Faltan ' + formatARS(Math.round(Math.abs(changeInArs) * 100))}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Total Destacado */}
          <div className="p-4 bg-slate-900 text-white rounded-xl shadow-xs space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">Total a cobrar</p>
              {isCard && cardType === 'credito' && installments > 1 && (
                <span className="text-[11px] font-mono text-amber-300 font-bold">
                  {installments}x de {formatARS(Math.round(totalCents / installments))}
                </span>
              )}
            </div>
            <p className="text-3xl font-extrabold tracking-tight text-white">{formatARS(totalCents)}</p>
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
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
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
        </>
      )}

      {/* PESTAÑA 2: CAJA DEL DÍA Y SEGUIMIENTO DIARIO DE FACTURACIÓN */}
      {activePosTab === 'cash_register' && (() => {
        const activeSales = dailySales.filter((s) => s.status !== 'voided');
        const totalDayCents = activeSales.reduce((acc, s) => acc + (s.totalCents - s.refundedCents), 0);
        const cashDayCents = activeSales
          .filter((s) => s.paymentMethodName.toLowerCase().includes('efectivo') && !s.paymentMethodName.toLowerCase().includes('dólar'))
          .reduce((acc, s) => acc + (s.totalCents - s.refundedCents), 0);
        const cardSales = activeSales.filter((s) => s.paymentMethodName.toLowerCase().includes('tarjeta'));
        const cardDayCents = cardSales.reduce((acc, s) => acc + (s.totalCents - s.refundedCents), 0);
        const debitDayCents = cardSales
          .filter((s) => s.cardType === 'debito')
          .reduce((acc, s) => acc + (s.totalCents - s.refundedCents), 0);
        const creditDayCents = cardSales
          .filter((s) => s.cardType !== 'debito')
          .reduce((acc, s) => acc + (s.totalCents - s.refundedCents), 0);
        const digitalDayCents = activeSales
          .filter(
            (s) =>
              s.paymentMethodName.toLowerCase().includes('transferencia') ||
              s.paymentMethodName.toLowerCase().includes('mercado') ||
              s.paymentMethodName.toLowerCase().includes('dólar') ||
              s.paymentMethodName.toLowerCase().includes('dolar'),
          )
          .reduce((acc, s) => acc + (s.totalCents - s.refundedCents), 0);

        return (
          <div className="space-y-4 no-print">
            {/* Barra de filtro de fecha */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Calendar className="h-4 w-4 text-orange-600" />
                <span className="text-xs font-bold text-slate-800">Fecha de arqueo de caja:</span>
                <input
                  type="date"
                  value={cashDateFilter}
                  onChange={(e) => setCashDateFilter(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 bg-slate-50 focus:bg-white"
                />
                {cashDateFilter !== todayIsoDate && (
                  <button
                    type="button"
                    onClick={() => setCashDateFilter(todayIsoDate)}
                    className="px-2.5 py-1.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-xs font-semibold cursor-pointer active:scale-95"
                  >
                    Volver a Hoy
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchDailySales(cashDateFilter)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer active:scale-95 transition-all"
              >
                Actualizar caja
              </button>
            </div>

            {/* 4 Tarjetas de Arqueo Diario */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 text-white rounded-xl p-4 shadow-xs space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Total Facturado en Caja</p>
                <p className="text-2xl font-black font-mono">{formatARS(totalDayCents)}</p>
                <p className="text-xs text-slate-300">
                  {activeSales.length} venta(s) activa(s) · US$ {exchangeRateUsd > 0 ? (totalDayCents / 100 / exchangeRateUsd).toFixed(2) : '0.00'}
                </p>
              </div>

              <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-2xs space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-bold">Efectivo en Mostrador</p>
                <p className="text-2xl font-black text-emerald-800 font-mono">{formatARS(cashDayCents)}</p>
                <p className="text-xs text-slate-500">Billetes físicos ARS en caja</p>
              </div>

              <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-2xs space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-amber-800 font-bold">Tarjetas (Débito y Crédito)</p>
                <p className="text-2xl font-black text-amber-900 font-mono">{formatARS(cardDayCents)}</p>
                <p className="text-[11px] text-slate-600">
                  Débito: <strong>{formatARS(debitDayCents)}</strong> · Crédito: <strong>{formatARS(creditDayCents)}</strong>
                </p>
              </div>

              <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-2xs space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-blue-800 font-bold">Transferencia / MP / USD</p>
                <p className="text-2xl font-black text-blue-900 font-mono">{formatARS(digitalDayCents)}</p>
                <p className="text-xs text-slate-500">Mercado Pago, bancos y divisas</p>
              </div>
            </div>

            {/* Tabla detallada de tickets del día */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Detalle de Tickets Emitidos ({dailySales.length})
                </h3>
              </div>

              {loadingDailySales ? (
                <div className="p-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
                  <span>Consultando ventas de la caja...</span>
                </div>
              ) : dailySales.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400">
                  No hay ventas registradas en la fecha seleccionada ({cashDateFilter}).
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Comprobante</th>
                        <th className="px-4 py-3">Hora</th>
                        <th className="px-4 py-3">Vendedor</th>
                        <th className="px-4 py-3">Artículos Vendidos</th>
                        <th className="px-4 py-3">Medio de Pago / Tarjeta</th>
                        <th className="px-4 py-3 text-right">Total Cobrado</th>
                        <th className="px-4 py-3 text-right">Ticket</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dailySales.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {s.saleNumber}
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                            {formatDateTime(s.createdAt)}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                            {s.userName}
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="truncate font-medium text-slate-800">
                              {s.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
                            </p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-semibold text-slate-900">{s.paymentMethodName}</span>
                            {(s.cardBrand || s.cardType) && (
                              <span className="ml-1.5 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-bold text-[10px]">
                                {s.cardBrand || 'Tarjeta'} · {s.cardType === 'debito' ? 'Débito' : `Crédito ${s.installments || 1}x`}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                            {formatARS(s.totalCents)}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setLastSale(s);
                                setReceiptOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-xs cursor-pointer active:scale-95"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Ver Ticket</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Modal de Comprobante Interno de Venta (imprimible) */}
      {receiptOpen && lastSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 print:p-0 print:border-none print:shadow-none">
            {/* Cabecera del comprobante con Logo oficial */}
            <div className="text-center pb-3 border-b border-slate-200">
              <div className="flex justify-center mb-1">
                <Logo variant="compact" theme="light" className="h-8 w-auto max-w-[200px]" />
              </div>
              <p className="text-xs text-slate-500 font-medium">Bariloche · Río Negro</p>
              <p className="text-[11px] text-slate-400 mt-0.5 uppercase tracking-wider font-semibold">Comprobante Interno de Venta</p>
              <div className="mt-2 text-xs font-mono font-bold text-orange-950 bg-orange-50 border border-orange-200 py-1 px-2.5 rounded inline-block">
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
                <span className="font-medium text-slate-900">
                  {lastSale.paymentMethodName}
                  {lastSale.cardBrand ? ` · ${lastSale.cardBrand}` : ''}
                  {lastSale.cardType ? ` (${lastSale.cardType === 'debito' ? 'Débito' : 'Crédito'})` : ''}
                  {lastSale.installments && lastSale.installments > 1 ? ` · ${lastSale.installments} cuotas` : ''}
                </span>
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
              {lastSale.surchargeCents > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>Recargo tarjeta ({lastSale.installments || 1} cuotas)</span>
                  <span>+ {formatARS(lastSale.surchargeCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>TOTAL</span>
                <span>{formatARS(lastSale.totalCents)}</span>
              </div>
              {lastSale.exchangeRateUsd && (
                <div className="flex justify-between text-[11px] text-slate-400 font-mono pt-0.5">
                  <span>Equivalente en divisas:</span>
                  <span>US$ {(lastSale.totalCents / 100 / lastSale.exchangeRateUsd).toFixed(2)} (@ ${lastSale.exchangeRateUsd})</span>
                </div>
              )}
            </div>

            {/* Pie de comprobante */}
            <div className="text-center text-[10px] text-slate-400 italic pt-1">
              Comprobante interno sin validez fiscal. Guardá este ticket para reclamos o cambios.
            </div>

            {/* Acciones del comprobante */}
            <div className="flex gap-2 pt-2 no-print">
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Printer className="h-4 w-4" />
                <span>Imprimir ticket</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptOpen(false)}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg cursor-pointer active:scale-95 transition-all"
              >
                Nueva venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Carga Manual de Producto que no está en Catálogo (con Motivo Obligatorio) */}
      {showManualModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Cargar Producto Manual en Mostrador</h3>
                <p className="text-[11px] text-slate-500">
                  Queda registrado que fue cargado manual junto con el motivo para auditoría de stock.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddManualItem} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descripción del repuesto *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="Ej: Retén de palier / Rulemán especial medida..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Marca (opc.)</label>
                  <input
                    type="text"
                    value={manualBrand}
                    onChange={(e) => setManualBrand(e.target.value)}
                    placeholder="Ej: DBH / Sav"
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Precio ($) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={manualPriceStr}
                    onChange={(e) => setManualPriceStr(e.target.value)}
                    placeholder="12500"
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-bold font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={manualQty}
                    onChange={(e) => setManualQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs text-center font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-semibold text-amber-900">
                  Motivo por el que se carga manual (Obligatorio) *
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Solo lo tiene MercadoLibre',
                    'No figura cargado en el sistema todavía',
                    'Compra puntual a otro distribuidor',
                    'Traído a pedido especial del cliente',
                  ].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setManualReason(r)}
                      className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer active:scale-95 transition-all ${
                        manualReason === r
                          ? 'bg-amber-600 text-white border-amber-600 font-bold'
                          : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  required
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="Escribí o detallá el motivo de carga manual..."
                  className="w-full px-3 py-2 border border-amber-300 bg-amber-50/40 rounded-lg text-xs font-medium text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all"
                >
                  Agregar al Carrito con Registro Manual
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Autorización de Supervisor para Descuentos mayores al 5% */}
      {showSupervisorModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                Autorización de Supervisor (Dto. {discountPct}%)
              </h3>
              <button
                type="button"
                onClick={() => setShowSupervisorModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              El vendedor tiene un tope de hasta <strong>{maxSellerDiscount || 5}%</strong>. Para aplicar un{' '}
              <strong>{discountPct}%</strong>, seleccioná qué supervisor autoriza esta operación:
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">Supervisor que autoriza *</label>
              <select
                value={tempSupervisorName}
                onChange={(e) => setTempSupervisorName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold"
              >
                <option value="Hugo Fernández (Supervisor General)">Hugo Fernández (Supervisor General)</option>
                <option value="Supervisor de Ventas">Supervisor de Ventas</option>
                <option value="Encargado de Salón">Encargado de Salón</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowSupervisorModal(false)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setSupervisorAuthorized(true);
                  setSupervisorAuthorizedBy(tempSupervisorName);
                  setShowSupervisorModal(false);
                }}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all"
              >
                Confirmar Autorización
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
