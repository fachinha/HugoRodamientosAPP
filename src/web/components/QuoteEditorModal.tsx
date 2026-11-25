import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  Search,
  Loader2,
  Car,
  User,
  Building2,
  FileText,
  AlertTriangle,
  Clock,
  Sparkles,
  DollarSign,
  PackageCheck,
} from 'lucide-react';
import { apiFetch, ApiClientError } from '../api/client';
import { formatARS, parseMoneyToCents, centsToInput } from '../../shared/money';
import type {
  QuoteDetail,
  QuoteItemInput,
  QuoteCreateInput,
  QuoteUpdateInput,
  CustomerType,
  ItemAvailability,
} from '../../shared/quotes';

interface EditableQuoteItem {
  id?: number;
  productId?: number | null;
  sku: string;
  description: string;
  brand: string;
  availability: ItemAvailability;
  quantity: number;
  unitPriceStr: string; // texto para edición en pantalla
  discountPct: number;
}

interface QuoteEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteToEdit: QuoteDetail | null;
  initialCustomer?: {
    id: number;
    name: string;
    customerType: CustomerType;
    phone: string | null;
    cuit: string | null;
    email: string | null;
    vehicles?: {
      id: number;
      brand: string | null;
      model: string | null;
      year: number | null;
      engine: string | null;
      plate: string | null;
    }[];
  } | null;
  onSaved: (savedQuote: QuoteDetail) => void;
}

export const QuoteEditorModal: React.FC<QuoteEditorModalProps> = ({
  isOpen,
  onClose,
  quoteToEdit,
  initialCustomer,
  onSaved,
}) => {
  // Cliente
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType>('particular');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCuit, setCustomerCuit] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // Buscador de clientes registrados
  const [customerSearchQ, setCustomerSearchQ] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [customerVehicles, setCustomerVehicles] = useState<any[]>([]);
  const custTimeoutRef = useRef<any>(null);

  // Vehículo
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState<string>('');
  const [vehicleEngine, setVehicleEngine] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');

  // Condiciones comerciales
  const [validDays, setValidDays] = useState<number>(5);
  const [includesTax, setIncludesTax] = useState<boolean>(true);
  const [paymentTerms, setPaymentTerms] = useState<string>(
    'Efectivo/Transferencia (dto.) - Tarjetas débito/crédito',
  );
  const [notes, setNotes] = useState<string>('');

  // Ítems
  const [items, setItems] = useState<EditableQuoteItem[]>([]);

  // Búsqueda en catálogo de productos
  const [productQuery, setProductQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  // Estados UI
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inicializar o resetear datos cuando abre el modal
  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage(null);
    setProductQuery('');
    setProductSearchResults([]);
    setCustomerSearchQ('');
    setCustomerSuggestions([]);

    if (quoteToEdit) {
      setCustomerId(quoteToEdit.customerId ?? null);
      setCustomerName(quoteToEdit.customerName);
      setCustomerType(quoteToEdit.customerType);
      setCustomerPhone(quoteToEdit.customerPhone || '');
      setCustomerCuit(quoteToEdit.customerCuit || '');
      setCustomerEmail(quoteToEdit.customerEmail || '');
      setCustomerVehicles([]);

      setVehicleBrand(quoteToEdit.vehicleBrand || '');
      setVehicleModel(quoteToEdit.vehicleModel || '');
      setVehicleYear(quoteToEdit.vehicleYear ? String(quoteToEdit.vehicleYear) : '');
      setVehicleEngine(quoteToEdit.vehicleEngine || '');
      setVehiclePlate(quoteToEdit.vehiclePlate || '');

      setValidDays(quoteToEdit.validDays || 5);
      setIncludesTax(quoteToEdit.includesTax ?? true);
      setPaymentTerms(
        quoteToEdit.paymentTerms ||
          'Efectivo/Transferencia (dto.) - Tarjetas débito/crédito',
      );
      setNotes(quoteToEdit.notes || '');

      setItems(
        quoteToEdit.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          sku: it.sku || '',
          description: it.description,
          brand: it.brand || '',
          availability: it.availability,
          quantity: it.quantity,
          unitPriceStr: centsToInput(it.unitPriceCents),
          discountPct: it.discountPct || 0,
        })),
      );
    } else {
      // Nuevo presupuesto (precargado desde Ficha Cliente si aplica)
      setCustomerId(initialCustomer?.id ?? null);
      setCustomerName(initialCustomer?.name || '');
      setCustomerType(initialCustomer?.customerType || 'particular');
      setCustomerPhone(initialCustomer?.phone || '');
      setCustomerCuit(initialCustomer?.cuit || '');
      setCustomerEmail(initialCustomer?.email || '');
      const initVehs = initialCustomer?.vehicles || [];
      setCustomerVehicles(initVehs);

      if (initVehs.length > 0) {
        setVehicleBrand(initVehs[0].brand || '');
        setVehicleModel(initVehs[0].model || '');
        setVehicleYear(initVehs[0].year ? String(initVehs[0].year) : '');
        setVehicleEngine(initVehs[0].engine || '');
        setVehiclePlate(initVehs[0].plate || '');
      } else {
        setVehicleBrand('');
        setVehicleModel('');
        setVehicleYear('');
        setVehicleEngine('');
        setVehiclePlate('');
      }

      setValidDays(5);
      setIncludesTax(true);
      setPaymentTerms('Efectivo/Transferencia (dto.) - Tarjetas débito/crédito');
      setNotes('');

      // Fila vacía para empezar rápido
      setItems([
        {
          sku: '',
          description: '',
          brand: '',
          availability: 'in_stock',
          quantity: 1,
          unitPriceStr: '',
          discountPct: 0,
        },
      ]);
    }
  }, [isOpen, quoteToEdit, initialCustomer]);

  const handleCustomerLookupChange = (q: string) => {
    setCustomerSearchQ(q);
    if (custTimeoutRef.current) clearTimeout(custTimeoutRef.current);
    if (!q.trim()) {
      setCustomerSuggestions([]);
      setSearchingCustomer(false);
      return;
    }
    setSearchingCustomer(true);
    custTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch<any>(`/crm/customers?q=${encodeURIComponent(q.trim())}&pageSize=8`);
        setCustomerSuggestions(res.items || []);
      } catch {
        setCustomerSuggestions([]);
      } finally {
        setSearchingCustomer(false);
      }
    }, 200);
  };

  const handleSelectExistingCustomer = async (cust: any) => {
    setCustomerId(cust.id);
    setCustomerName(cust.name || '');
    setCustomerType(cust.customerType === 'empresa' ? 'empresa' : 'particular');
    setCustomerPhone(cust.phone || '');
    setCustomerCuit(cust.cuit || '');
    setCustomerEmail(cust.email || '');
    setCustomerSearchQ('');
    setCustomerSuggestions([]);

    try {
      const detail = await apiFetch<any>(`/crm/customers/${cust.id}`);
      const vehs = detail?.vehicles || [];
      setCustomerVehicles(vehs);
      if (vehs.length > 0 && !vehiclePlate && !vehicleModel) {
        setVehicleBrand(vehs[0].brand || '');
        setVehicleModel(vehs[0].model || '');
        setVehicleYear(vehs[0].year ? String(vehs[0].year) : '');
        setVehicleEngine(vehs[0].engine || '');
        setVehiclePlate(vehs[0].plate || '');
      }
    } catch {
      setCustomerVehicles([]);
    }
  };

  // Búsqueda de productos en tiempo real con debounce
  const handleProductSearchChange = (query: string) => {
    setProductQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!query.trim()) {
      setProductSearchResults([]);
      setSearchingProducts(false);
      return;
    }

    setSearchingProducts(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch<any>(
          `/products?q=${encodeURIComponent(query.trim())}&pageSize=8`,
        );
        setProductSearchResults(res.items || []);
      } catch {
        setProductSearchResults([]);
      } finally {
        setSearchingProducts(false);
      }
    }, 250);
  };

  const handleSelectCatalogProduct = (prod: any) => {
    const newItem: EditableQuoteItem = {
      productId: prod.id,
      sku: prod.sku || '',
      description: prod.name,
      brand: prod.brand || '',
      availability: prod.stock > 0 ? 'in_stock' : 'to_order',
      quantity: 1,
      unitPriceStr: centsToInput(prod.price_cents || 0),
      discountPct: 0,
    };

    // Si la primera fila está vacía y sin datos, la reemplazamos
    if (
      items.length === 1 &&
      !items[0].description.trim() &&
      !items[0].sku.trim() &&
      !items[0].unitPriceStr
    ) {
      setItems([newItem]);
    } else {
      setItems((prev) => [...prev, newItem]);
    }

    setProductQuery('');
    setProductSearchResults([]);
  };

  const handleAddItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        sku: '',
        description: '',
        brand: '',
        availability: 'in_stock',
        quantity: 1,
        unitPriceStr: '',
        discountPct: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      // Si es el único, lo dejamos en blanco
      setItems([
        {
          sku: '',
          description: '',
          brand: '',
          availability: 'in_stock',
          quantity: 1,
          unitPriceStr: '',
          discountPct: 0,
        },
      ]);
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (
    index: number,
    updates: Partial<EditableQuoteItem>,
  ) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...updates } : it)),
    );
  };

  // Cálculos de totales
  const calculatedItems = items.map((it) => {
    const unitPriceCents = parseMoneyToCents(it.unitPriceStr) || 0;
    const qty = Math.max(1, it.quantity || 1);
    const discPct = Math.max(0, Math.min(100, it.discountPct || 0));
    const gross = unitPriceCents * qty;
    const discount = Math.round((gross * discPct) / 100);
    const net = gross - discount;
    return {
      gross,
      discount,
      net,
    };
  });

  const subtotalCents = calculatedItems.reduce((acc, it) => acc + it.gross, 0);
  const totalDiscountCents = calculatedItems.reduce(
    (acc, it) => acc + it.discount,
    0,
  );
  const netSubtotalCents = subtotalCents - totalDiscountCents;
  const taxCents = includesTax ? 0 : Math.round(netSubtotalCents * 0.21);
  const totalCents = netSubtotalCents + taxCents;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!customerName.trim()) {
      setErrorMessage('Ingresá el nombre del cliente o empresa.');
      return;
    }

    if (items.length === 0) {
      setErrorMessage('Debés agregar al menos un repuesto al presupuesto.');
      return;
    }

    // Validar ítems
    const validatedItems: QuoteItemInput[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.description.trim()) {
        setErrorMessage(`La descripción en el ítem #${i + 1} es obligatoria.`);
        return;
      }
      const unitCents = parseMoneyToCents(it.unitPriceStr);
      if (unitCents === null || unitCents < 0) {
        setErrorMessage(
          `El precio unitario en "${it.description}" no es válido.`,
        );
        return;
      }
      validatedItems.push({
        id: it.id,
        productId: it.productId || null,
        sku: it.sku.trim() || null,
        description: it.description.trim(),
        brand: it.brand.trim() || null,
        unitPriceCents: unitCents,
        quantity: Math.max(1, Number(it.quantity) || 1),
        discountPct: Math.max(0, Math.min(100, Number(it.discountPct) || 0)),
        availability: it.availability,
      });
    }

    const payload: QuoteCreateInput = {
      customerId,
      customerName: customerName.trim(),
      customerType,
      customerPhone: customerPhone.trim() || null,
      customerCuit: customerCuit.trim() || null,
      customerEmail: customerEmail.trim() || null,
      vehicleBrand: vehicleBrand.trim() || null,
      vehicleModel: vehicleModel.trim() || null,
      vehicleYear: vehicleYear ? parseInt(vehicleYear, 10) : null,
      vehicleEngine: vehicleEngine.trim() || null,
      vehiclePlate: vehiclePlate.trim() ? vehiclePlate.trim().toUpperCase() : null,
      validDays: Number(validDays) || 5,
      includesTax,
      paymentTerms: paymentTerms.trim(),
      notes: notes.trim() || null,
      items: validatedItems,
    };

    setIsSubmitting(true);
    try {
      let savedQuote: QuoteDetail;
      if (quoteToEdit) {
        savedQuote = await apiFetch<QuoteDetail>(`/quotes/${quoteToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        savedQuote = await apiFetch<QuoteDetail>('/quotes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      onSaved(savedQuote);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al guardar el presupuesto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl flex flex-col overflow-hidden max-h-[94vh]">
        {/* Cabecera */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-600/20 text-orange-400 rounded-lg">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">
                {quoteToEdit
                  ? `Editar Presupuesto ${quoteToEdit.quoteNumber}`
                  : 'Nuevo Presupuesto de Repuestos'}
              </h3>
              <p className="text-xs text-slate-400">
                Cotización oficial Hugo Repuestos Bariloche para vehículos y empresas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-800 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Sección 1: Datos del Cliente */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800">
                <User className="h-4 w-4 text-orange-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  1. Datos del Cliente
                </h4>
              </div>
              {/* Selector Particular / Empresa */}
              <div className="flex rounded-lg bg-slate-200 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setCustomerType('particular')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    customerType === 'particular'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Particular
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerType('empresa')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    customerType === 'empresa'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Empresa / Taller
                </button>
              </div>
            </div>

            {/* Buscador rápido de clientes registrados */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-orange-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={customerSearchQ}
                onChange={(e) => handleCustomerLookupChange(e.target.value)}
                placeholder="Buscar cliente registrado en Clientes (por nombre, CUIT, teléfono o patente)..."
                className="w-full pl-9 pr-8 py-2 bg-orange-50/50 border border-orange-200 rounded-md text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
              />
              {searchingCustomer && (
                <Loader2 className="h-3.5 w-3.5 text-orange-600 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
              )}
              {customerId && (
                <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                  <span>Vinculado a Ficha Cliente #{customerId} ({customerName})</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerId(null);
                      setCustomerVehicles([]);
                    }}
                    className="text-emerald-700 hover:text-rose-600 cursor-pointer"
                    title="Desvincular cliente"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {customerSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-300 rounded-lg shadow-xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {customerSuggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectExistingCustomer(c)}
                      className="w-full text-left px-3 py-2 hover:bg-orange-50 flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div>
                        <p className="font-bold text-slate-900">{c.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {c.phone ? `Tel: ${c.phone} · ` : ''}
                          {c.cuit ? `CUIT: ${c.cuit} · ` : ''}
                          {c.email ? `Mail: ${c.email}` : 'Sin mail registrado'}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        Seleccionar
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Nombre y Apellido / Razón Social *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Juan Pérez / Transporte Patagonia S.R.L."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  WhatsApp / Celular
                </label>
                <input
                  type="tel"
                  placeholder="Ej: 294 4629707"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Email (para comprobante)
                </label>
                <input
                  type="email"
                  placeholder="Ej: cliente@correo.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  CUIT / DNI
                </label>
                <input
                  type="text"
                  placeholder="Ej: 20-30123456-7"
                  value={customerCuit}
                  onChange={(e) => setCustomerCuit(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Sección 2: Datos del Vehículo / Aplicación */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-slate-800">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-orange-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  2. Vehículo / Aplicación
                </h4>
              </div>
              {customerVehicles.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 font-medium">Vehículos del cliente:</span>
                  {customerVehicles.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setVehicleBrand(v.brand || '');
                        setVehicleModel(v.model || '');
                        setVehicleYear(v.year ? String(v.year) : '');
                        setVehicleEngine(v.engine || '');
                        setVehiclePlate(v.plate || '');
                      }}
                      className="px-2 py-0.5 bg-white hover:bg-orange-50 border border-slate-300 hover:border-orange-300 rounded text-[11px] font-semibold text-slate-800 cursor-pointer active:scale-96"
                    >
                      {[v.brand, v.model, v.plate].filter(Boolean).join(' · ')}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Marca</label>
                <input
                  type="text"
                  placeholder="Ej: Ford / Toyota"
                  value={vehicleBrand}
                  onChange={(e) => setVehicleBrand(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Modelo</label>
                <input
                  type="text"
                  placeholder="Ej: Ranger / Hilux"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Año</label>
                <input
                  type="number"
                  placeholder="Ej: 2018"
                  min="1950"
                  max="2050"
                  value={vehicleYear}
                  onChange={(e) => setVehicleYear(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Motor</label>
                <input
                  type="text"
                  placeholder="Ej: 3.2 TDCi / 2.8"
                  value={vehicleEngine}
                  onChange={(e) => setVehicleEngine(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Patente / Dominio</label>
                <input
                  type="text"
                  placeholder="Ej: AD 123 XY"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden font-mono uppercase"
                />
              </div>
            </div>
          </div>

          {/* Sección 3: Repuestos e Ítems del Presupuesto */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-800">
                <PackageCheck className="h-4 w-4 text-orange-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  3. Detalle de Repuestos Cotizados
                </h4>
              </div>

              {/* Búsqueda rápida en el catálogo oficial para agregar ítems */}
              <div className="relative min-w-[280px]">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar y agregar repuesto del catálogo..."
                    value={productQuery}
                    onChange={(e) => handleProductSearchChange(e.target.value)}
                    className="w-full pl-8 pr-8 py-1.5 bg-white border border-orange-300 rounded-md text-xs focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                  />
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  {searchingProducts && (
                    <Loader2 className="h-3.5 w-3.5 text-orange-500 animate-spin absolute right-2.5 top-2.5" />
                  )}
                </div>

                {/* Dropdown de resultados de catálogo */}
                {productSearchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-300 rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {productSearchResults.map((prod) => (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => handleSelectCatalogProduct(prod)}
                        className="w-full text-left px-3 py-2 hover:bg-orange-50 flex items-center justify-between text-xs transition-colors cursor-pointer"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{prod.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            SKU: {prod.sku} {prod.brand ? `· ${prod.brand}` : ''} · Stock: {prod.stock} {prod.unit}
                          </p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <span className="font-mono font-bold text-slate-800">
                            {formatARS(prod.price_cents || 0)}
                          </span>
                          <span className="block text-[9px] text-orange-600 font-semibold">
                            + Agregar
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Tabla interactiva de ítems */}
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-semibold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 w-10">#</th>
                    <th className="px-3 py-2 w-28">Código / SKU</th>
                    <th className="px-3 py-2">Descripción del Repuesto *</th>
                    <th className="px-3 py-2 w-24">Marca</th>
                    <th className="px-3 py-2 w-36">Disponibilidad</th>
                    <th className="px-3 py-2 text-center w-20">Cant.</th>
                    <th className="px-3 py-2 text-right w-28">P. Unitario ($)</th>
                    <th className="px-3 py-2 text-right w-20">Dto %</th>
                    <th className="px-3 py-2 text-right w-28">Subtotal</th>
                    <th className="px-2 py-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => {
                    const lineCalc = calculatedItems[idx] || { net: 0 };
                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            placeholder="SKU"
                            value={item.sku}
                            onChange={(e) =>
                              handleUpdateItem(idx, { sku: e.target.value })
                            }
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            required
                            placeholder="Ej: Rodamiento rueda delantera 6204 2RS"
                            value={item.description}
                            onChange={(e) =>
                              handleUpdateItem(idx, { description: e.target.value })
                            }
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-medium focus:ring-1 focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            placeholder="SKF / FAG"
                            value={item.brand}
                            onChange={(e) =>
                              handleUpdateItem(idx, { brand: e.target.value })
                            }
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={item.availability}
                            onChange={(e) =>
                              handleUpdateItem(idx, {
                                availability: e.target.value as ItemAvailability,
                              })
                            }
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-medium"
                          >
                            <option value="in_stock">✅ En stock</option>
                            <option value="to_order">⏱️ A pedido 24/48hs</option>
                            <option value="confirm_lead_time">📞 A confirmar</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              handleUpdateItem(idx, {
                                quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                              })
                            }
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs text-center font-bold"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            placeholder="0,00"
                            value={item.unitPriceStr}
                            onChange={(e) =>
                              handleUpdateItem(idx, { unitPriceStr: e.target.value })
                            }
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs text-right font-mono"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="0"
                            value={item.discountPct || ''}
                            onChange={(e) =>
                              handleUpdateItem(idx, {
                                discountPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                              })
                            }
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs text-right font-mono"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-800">
                          {formatARS(lineCalc.net)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title="Eliminar repuesto"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-1">
              <button
                type="button"
                onClick={handleAddItemRow}
                className="inline-flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 font-semibold cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Agregar otra línea de repuesto libre</span>
              </button>
            </div>
          </div>

          {/* Sección 4: Condiciones Comerciales & Totales */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
            {/* Opciones comerciales (7 cols) */}
            <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
              <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                4. Condiciones Comerciales & Validez
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Validez del Presupuesto
                  </label>
                  <select
                    value={validDays}
                    onChange={(e) => setValidDays(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                  >
                    <option value={2}>48 horas corridas</option>
                    <option value={5}>5 días corridos (Estándar Hugo)</option>
                    <option value={7}>7 días corridos (1 semana)</option>
                    <option value={15}>15 días corridos</option>
                    <option value={30}>30 días corridos</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tratamiento de IVA
                  </label>
                  <select
                    value={includesTax ? 'included' : 'breakdown'}
                    onChange={(e) => setIncludesTax(e.target.value === 'included')}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                  >
                    <option value="included">
                      IVA incluido en precios (Consumidor Final)
                    </option>
                    <option value="breakdown">
                      Desglosar IVA 21% (Empresa / Factura A)
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Condiciones y Medios de Pago
                </label>
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="Ej: Efectivo/Transferencia (dto.) - Tarjetas débito/crédito"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Observaciones / Notas adicionales
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: Cotizado según muestra traída al local. Precios sujetos a variación de flete."
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Cuadro de Totales (5 cols) */}
            <div className="lg:col-span-5 bg-slate-900 text-white rounded-lg p-5 flex flex-col justify-between space-y-3 font-mono">
              <h4 className="font-bold text-orange-400 uppercase tracking-wider text-xs font-sans">
                Resumen de Cotización
              </h4>

              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span>Subtotal bruto:</span>
                  <span>{formatARS(subtotalCents)}</span>
                </div>

                {totalDiscountCents > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Descuentos:</span>
                    <span>- {formatARS(totalDiscountCents)}</span>
                  </div>
                )}

                {!includesTax && (
                  <div className="flex justify-between text-slate-400">
                    <span>IVA (21%):</span>
                    <span>+ {formatARS(taxCents)}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800 pt-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-bold text-white uppercase font-sans">
                    Total:
                  </span>
                  <span className="text-2xl font-black text-orange-500">
                    {formatARS(totalCents)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-sans mt-1">
                  {includesTax
                    ? 'Precios con IVA incluido'
                    : 'Precios netos + 21% IVA desglosado'}
                </p>
              </div>
            </div>
          </div>

          {/* Botones de acción al pie del formulario */}
          <div className="border-t border-slate-200 pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>
                  {quoteToEdit
                    ? 'Guardar Cambios de Presupuesto'
                    : 'Generar Presupuesto'}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
