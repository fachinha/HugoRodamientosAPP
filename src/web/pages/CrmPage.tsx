import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import {
  TrendingUp,
  Package,
  Users,
  DollarSign,
  Download,
  Search,
  Filter,
  Plus,
  MessageCircle,
  Eye,
  Edit2,
  Calendar,
  CreditCard,
  UserCheck,
  AlertTriangle,
  Loader2,
  Clock,
  Sparkles,
  Car,
  Building2,
  User,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { formatARS, formatNumber } from '../../shared/money';
import { formatDate } from '../../shared/time';
import { useAuth } from '../context/AuthContext';
import { CustomerEditorModal } from '../components/CustomerEditorModal';
import { CustomerDetailModal } from '../components/CustomerDetailModal';
import type {
  StoreAnalyticsSummary,
  ProductProfitabilityItem,
  CustomerListItem,
  CustomerProfileDetail,
  CustomerType,
  AbcClassification,
} from '../../shared/schemas';

export const CrmPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();

  // Pestaña principal: 'store' | 'products' | 'customers'
  const [activeTab, setActiveTab] = useState<'store' | 'products' | 'customers'>(() => {
    const urlTab = searchParams.get('tab');
    if (urlTab === 'customers' || urlTab === 'products' || urlTab === 'store') return urlTab;
    return isAdmin ? 'store' : 'customers';
  });

  // Período para analítica
  const [period, setPeriod] = useState<string>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Estados de datos
  const [storeData, setStoreData] = useState<StoreAnalyticsSummary | null>(null);
  const [loadingStore, setLoadingStore] = useState(false);

  // Rentabilidad de productos
  const [productItems, setProductItems] = useState<ProductProfitabilityItem[]>([]);
  const [productsSummary, setProductsSummary] = useState<any>(null);
  const [productSearch, setProductSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [productSort, setProductSort] = useState<'profit' | 'revenue' | 'margin' | 'units'>('profit');
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Clientes
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [customersTotal, setCustomersTotal] = useState(0);
  const [customersPage, setCustomersPage] = useState(1);
  const [customersMetrics, setCustomersMetrics] = useState({
    totalCustomers: 0,
    businessCustomers: 0,
    activeCustomers: 0,
    inactiveCustomers: 0,
  });
  const [customerSearch, setCustomerSearch] = useState(() => searchParams.get('q') || '');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>('all');
  const [customerStatusFilter, setCustomerStatusFilter] = useState<string>('all');
  const [customerMissingFilter, setCustomerMissingFilter] = useState<string>(
    () => searchParams.get('missing') || 'all',
  );
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const customerSearchTimeout = useRef<any>(null);

  // Modales
  const [editorOpen, setEditorOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<CustomerProfileDetail | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfileDetail | null>(null);

  // 1. Cargar Rendimiento del Local
  const fetchStoreAnalytics = async () => {
    if (!isAdmin) return;
    setLoadingStore(true);
    try {
      const qParams = new URLSearchParams({ period });
      if (period === 'custom' && customFrom && customTo) {
        qParams.set('from', customFrom);
        qParams.set('to', customTo);
      }
      const res = await apiFetch<StoreAnalyticsSummary>(`/analytics/store?${qParams.toString()}`);
      setStoreData(res);
    } catch {
      // Ignorar o mostrar alerta
    } finally {
      setLoadingStore(false);
    }
  };

  // 2. Cargar Rentabilidad de Productos
  const fetchProductsProfitability = async () => {
    if (!isAdmin) return;
    setLoadingProducts(true);
    try {
      const qParams = new URLSearchParams({
        period,
        pageSize: '100',
        sort: productSort,
        dir: 'desc',
      });
      if (selectedBrand !== 'all') qParams.set('brand', selectedBrand);
      const res = await apiFetch<any>(`/analytics/products?${qParams.toString()}`);
      setProductItems(res.items || []);
      setProductsSummary(res.summary || null);
    } catch {
      // Error
    } finally {
      setLoadingProducts(false);
    }
  };

  // 3. Cargar Clientes
  const fetchCustomers = async (page = 1) => {
    setLoadingCustomers(true);
    try {
      const qParams = new URLSearchParams({
        page: String(page),
        pageSize: '25',
        customerType: customerTypeFilter,
        status: customerStatusFilter,
        missing: customerMissingFilter,
      });
      if (customerSearch.trim()) qParams.set('q', customerSearch.trim());

      const res = await apiFetch<any>(`/crm/customers?${qParams.toString()}`);
      setCustomers(res.items || []);
      setCustomersTotal(res.total || 0);
      setCustomersPage(res.page || 1);
      if (res.metrics) setCustomersMetrics(res.metrics);
    } catch {
      // Error
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'store' && isAdmin) fetchStoreAnalytics();
    if (activeTab === 'products' && isAdmin) fetchProductsProfitability();
    if (activeTab === 'customers') fetchCustomers(1);
  }, [activeTab, period, productSort, selectedBrand, customerTypeFilter, customerStatusFilter, customerMissingFilter]);

  const handleCustomerSearchChange = (val: string) => {
    setCustomerSearch(val);
    if (customerSearchTimeout.current) clearTimeout(customerSearchTimeout.current);
    customerSearchTimeout.current = setTimeout(() => {
      fetchCustomers(1);
    }, 300);
  };

  const handleOpenCustomerDetail = async (c: CustomerListItem) => {
    try {
      const full = await apiFetch<CustomerProfileDetail>(`/crm/customers/${c.id}`);
      setSelectedCustomer(full);
      setDetailOpen(true);
    } catch {
      alert('Error al abrir la ficha del cliente.');
    }
  };

  const handleOpenCustomerEdit = async (c: CustomerListItem) => {
    try {
      const full = await apiFetch<CustomerProfileDetail>(`/crm/customers/${c.id}`);
      setCustomerToEdit(full);
      setEditorOpen(true);
    } catch {
      alert('Error al cargar datos del cliente.');
    }
  };

  const handleExportCsv = () => {
    const qParams = new URLSearchParams({ period });
    window.open(`/api/analytics/export?${qParams.toString()}`, '_blank');
  };

  // Filtrado de productos en memoria por buscador
  const filteredProducts = productItems.filter((p) => {
    if (!productSearch.trim()) return true;
    const q = productSearch.toLowerCase();
    return (
      p.sku.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.brand && p.brand.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              CRM & Rentabilidad del Negocio
            </h2>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
              Business Intelligence
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Control de márgenes y ganancias del local, rentabilidad por repuesto y gestión y fidelización de clientes por WhatsApp.
          </p>
        </div>

        {/* Selector de Período para analítica */}
        {activeTab !== 'customers' && isAdmin && (
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg p-1 text-xs">
            <Calendar className="h-4 w-4 text-slate-500 ml-1.5" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-transparent font-medium text-slate-800 focus:outline-hidden cursor-pointer pr-2"
            >
              <option value="this_month">Este mes (Mes en curso)</option>
              <option value="last_month">Mes anterior</option>
              <option value="last_30_days">Últimos 30 días</option>
              <option value="last_90_days">Últimos 90 días</option>
              <option value="year_to_date">Año actual acumulado</option>
            </select>
          </div>
        )}

        {activeTab === 'customers' && (
          <button
            type="button"
            onClick={() => {
              setCustomerToEdit(null);
              setEditorOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo Cliente / Empresa</span>
          </button>
        )}
      </div>

      {/* Selector de Pestañas Principales */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-lg px-2 text-xs font-bold text-slate-600">
        {isAdmin && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('store')}
              className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'store'
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              <span>Rendimiento del Local (Ventas del Mes)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('products')}
              className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'products'
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Package className="h-4 w-4" />
              <span>Rentabilidad de Repuestos (Matriz ABC)</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('customers')}
          className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'customers'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Directorio CRM de Clientes & Flotas ({customersTotal})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* PESTAÑA 1: RENDIMIENTO DEL LOCAL (Ventas del Mes & Ganancias)             */}
      {/* ========================================================================= */}
      {activeTab === 'store' && isAdmin && (
        <div className="space-y-5">
          {loadingStore || !storeData ? (
            <div className="p-16 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
              <span>Calculando rentabilidad del período...</span>
            </div>
          ) : (
            <>
              {/* 4 Tarjetas KPI Clave */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Facturación Neta */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-500 text-xs">
                    <span className="font-semibold uppercase tracking-wider text-[11px]">
                      Facturación Neta
                    </span>
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-black text-slate-900 font-mono">
                    {formatARS(storeData.revenueCents)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {storeData.salesCount} ventas ({storeData.unitsSold} repuestos)
                  </p>
                </div>

                {/* 2. Costo CMV */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-500 text-xs">
                    <span className="font-semibold uppercase tracking-wider text-[11px]">
                      Costo Mercadería (CMV)
                    </span>
                    <Package className="h-4 w-4 text-amber-600" />
                  </div>
                  <p className="text-2xl font-black text-slate-700 font-mono">
                    {formatARS(storeData.costCents)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Costo real de adquisición reposición
                  </p>
                </div>

                {/* 3. Ganancia Bruta Real */}
                <div className="bg-white border border-emerald-200 bg-emerald-50/20 rounded-xl p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-emerald-800 text-xs">
                    <span className="font-bold uppercase tracking-wider text-[11px]">
                      Ganancia Bruta Real
                    </span>
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-black text-emerald-600 font-mono">
                    {formatARS(storeData.grossProfitCents)}
                  </p>
                  <p className="text-[11px] text-emerald-700 font-semibold">
                    Dinero limpio tras descontar costo mercadería
                  </p>
                </div>

                {/* 4. Margen Bruto Promedio */}
                <div className="bg-white border border-orange-200 bg-orange-50/20 rounded-xl p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-orange-800 text-xs">
                    <span className="font-bold uppercase tracking-wider text-[11px]">
                      Margen Comercial
                    </span>
                    <Sparkles className="h-4 w-4 text-orange-600" />
                  </div>
                  <p className="text-2xl font-black text-orange-600 font-mono">
                    {storeData.grossMarginPct}%
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Ticket Promedio: {formatARS(storeData.averageTicketCents)}
                  </p>
                </div>
              </div>

              {/* Gráfico de Evolución Diaria de Ventas y Ganancia */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Evolución Diaria de Facturación y Ganancia
                    </h3>
                    <p className="text-xs text-slate-500">
                      Comparativa día por día entre ventas totales (barra completa) y ganancia neta (verde).
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span className="h-3 w-3 rounded-xs bg-slate-200 border border-slate-300" />
                      Costo CMV
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                      <span className="h-3 w-3 rounded-xs bg-emerald-500" />
                      Ganancia Bruta
                    </span>
                  </div>
                </div>

                {storeData.dailyTrend.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400 italic">
                    No hay ventas registradas en el período seleccionado.
                  </p>
                ) : (
                  <div className="pt-4 overflow-x-auto">
                    <div className="flex items-end gap-2 h-48 min-w-[550px] pb-2 border-b border-slate-200">
                      {storeData.dailyTrend.map((d, idx) => {
                        const maxRev = Math.max(
                          ...storeData.dailyTrend.map((t) => t.revenueCents),
                          1,
                        );
                        const heightPct = Math.round((d.revenueCents / maxRev) * 100);
                        const profitPct =
                          d.revenueCents > 0
                            ? Math.round((d.profitCents / d.revenueCents) * 100)
                            : 0;

                        return (
                          <div
                            key={idx}
                            className="flex-1 flex flex-col items-center justify-end h-full group relative"
                          >
                            {/* Tooltip flotante */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-2 bg-slate-900 text-white text-[10px] rounded p-2 pointer-events-none z-30 whitespace-nowrap shadow-xl">
                              <p className="font-bold">{d.date}</p>
                              <p>Ventas: {formatARS(d.revenueCents)} ({d.salesCount} op.)</p>
                              <p className="text-emerald-400">Ganancia: {formatARS(d.profitCents)} ({d.marginPct}%)</p>
                            </div>

                            {/* Barra combinada */}
                            <div
                              style={{ height: `${Math.max(8, heightPct)}%` }}
                              className="w-full max-w-[28px] rounded-t-md bg-slate-200 relative overflow-hidden flex flex-col justify-end"
                            >
                              <div
                                style={{ height: `${Math.max(4, profitPct)}%` }}
                                className="w-full bg-emerald-500 transition-all"
                              />
                            </div>
                            <span className="text-[10px] text-slate-500 mt-1 font-mono">
                              {d.dayLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Medios de Pago y Vendedores */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Medios de Pago */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-orange-600" />
                    Facturación por Medio de Pago
                  </h4>
                  <div className="space-y-2.5 text-xs">
                    {storeData.byPaymentMethod.map((pm) => (
                      <div key={pm.paymentMethodId} className="space-y-1">
                        <div className="flex justify-between font-medium">
                          <span className="text-slate-800">{pm.name} ({pm.salesCount} op.)</span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatARS(pm.totalCents)} <span className="text-slate-400 font-normal">({pm.pctOfTotal}%)</span>
                          </span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${pm.pctOfTotal}%` }}
                            className="h-full bg-orange-600 rounded-full"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rendimiento por Asesor */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-indigo-600" />
                    Rendimiento por Vendedor / Asesor
                  </h4>
                  <div className="divide-y divide-slate-100 text-xs">
                    {storeData.bySeller.map((s) => (
                      <div key={s.userId} className="py-2.5 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{s.displayName}</p>
                          <p className="text-[11px] text-slate-400">
                            {s.salesCount} ventas · Ticket prom: {formatARS(s.averageTicketCents)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-slate-900">{formatARS(s.revenueCents)}</p>
                          <p className="text-[10px] text-emerald-700 font-semibold">
                            + {formatARS(s.profitCents)} ganancia
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Ranking de Marcas (SKF, FAG, etc.) */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Marcas más Vendidas y su Rentabilidad
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {storeData.brandRanking.map((b, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-1">
                      <p className="font-black text-slate-900 text-sm">{b.brand}</p>
                      <p className="text-[11px] text-slate-500">{b.unitsSold} unidades vendidas</p>
                      <div className="flex justify-between pt-1 border-t border-slate-200 font-mono text-[11px]">
                        <span>Facturado:</span>
                        <span className="font-bold text-slate-800">{formatARS(b.revenueCents)}</span>
                      </div>
                      <div className="flex justify-between font-mono text-[11px] text-emerald-700 font-bold">
                        <span>Margen:</span>
                        <span>{b.marginPct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 2: RENTABILIDAD DE REPUESTOS (Matriz ABC)                          */}
      {/* ========================================================================= */}
      {activeTab === 'products' && isAdmin && (
        <div className="space-y-4">
          {/* Barra de Filtros y Búsqueda */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 w-full">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por SKU o descripción de repuesto..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Ordenamiento */}
              <select
                value={productSort}
                onChange={(e) => setProductSort(e.target.value as any)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md font-medium text-slate-700 cursor-pointer"
              >
                <option value="profit">Mayor Ganancia ($)</option>
                <option value="margin">Mayor Margen (%)</option>
                <option value="revenue">Mayor Facturación ($)</option>
                <option value="units">Más Unidades Vendidas</option>
              </select>

              {/* Botón Exportar CSV */}
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-semibold transition-colors cursor-pointer"
                title="Descargar reporte en formato Excel / CSV"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exportar CSV</span>
              </button>
            </div>
          </div>

          {/* Tabla de Rentabilidad */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
            {loadingProducts ? (
              <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                <span>Cargando análisis de rentabilidad...</span>
              </div>
            ) : filteredProducts.length === 0 ? (
              <p className="p-12 text-center text-slate-400 text-xs italic">
                No se encontraron productos para los filtros seleccionados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5">SKU / Código</th>
                      <th className="px-3 py-2.5">Repuesto / Marca</th>
                      <th className="px-3 py-2.5 text-center">Unidades</th>
                      <th className="px-3 py-2.5 text-right">Facturación</th>
                      <th className="px-3 py-2.5 text-right">Costo Total</th>
                      <th className="px-3 py-2.5 text-right">Ganancia Real ($)</th>
                      <th className="px-3 py-2.5 text-center">Margen</th>
                      <th className="px-3 py-2.5 text-center">Stock</th>
                      <th className="px-3 py-2.5 text-center">Clasificación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {filteredProducts.map((p) => {
                      // Badge clasificación ABC
                      let abcBadge = (
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium">
                          Sin rotación
                        </span>
                      );
                      if (p.abcClass === 'star') {
                        abcBadge = (
                          <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px] inline-flex items-center gap-0.5">
                            ⭐ Estrella
                          </span>
                        );
                      } else if (p.abcClass === 'cash_cow') {
                        abcBadge = (
                          <span className="bg-indigo-100 text-indigo-900 font-semibold px-2 py-0.5 rounded text-[10px]">
                            🐮 Gran Volumen
                          </span>
                        );
                      } else if (p.abcClass === 'low_margin') {
                        abcBadge = (
                          <span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px]">
                            ⚠️ Margen Bajo
                          </span>
                        );
                      }

                      // Color del margen
                      const marginColor =
                        p.marginPct >= 30
                          ? 'text-emerald-700 font-bold'
                          : p.marginPct >= 15
                          ? 'text-amber-700 font-semibold'
                          : 'text-rose-600 font-bold';

                      return (
                        <tr key={p.productId} className="hover:bg-slate-50/70">
                          <td className="px-3 py-2 font-mono text-[11px] font-bold text-slate-800">
                            {p.sku}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-slate-900">{p.name}</p>
                            <p className="text-[10px] text-slate-400">
                              {p.brand ? `${p.brand} · ` : ''}{p.categoryName || 'General'}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-800">
                            {p.unitsSold}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-800">
                            {formatARS(p.revenueCents)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-500">
                            {formatARS(p.costCents)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-black text-slate-900">
                            {formatARS(p.profitCents)}
                          </td>
                          <td className={`px-3 py-2 text-center font-mono text-xs ${marginColor}`}>
                            {p.marginPct}%
                          </td>
                          <td className="px-3 py-2 text-center font-mono font-medium text-slate-700">
                            {p.currentStock}
                          </td>
                          <td className="px-3 py-2 text-center">{abcBadge}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 3: DIRECTORIO CRM DE CLIENTES & FLOTAS                            */}
      {/* ========================================================================= */}
      {activeTab === 'customers' && (
        <div className="space-y-4">
          {/* Tarjetas de Métricas de Clientes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs">
              <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
                Total Clientes
              </span>
              <p className="text-2xl font-black text-slate-900 mt-0.5">
                {customersMetrics.totalCustomers}
              </p>
            </div>

            <div className="bg-white border border-indigo-100 rounded-lg p-3 shadow-2xs">
              <span className="font-semibold text-indigo-700 uppercase tracking-wider text-[10px]">
                Empresas & Talleres
              </span>
              <p className="text-2xl font-black text-indigo-700 mt-0.5">
                {customersMetrics.businessCustomers}
              </p>
            </div>

            <div className="bg-white border border-emerald-100 rounded-lg p-3 shadow-2xs">
              <span className="font-semibold text-emerald-700 uppercase tracking-wider text-[10px] flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Clientes Activos
              </span>
              <p className="text-2xl font-black text-emerald-700 mt-0.5">
                {customersMetrics.activeCustomers}
              </p>
            </div>

            <div className="bg-white border border-rose-100 rounded-lg p-3 shadow-2xs">
              <span className="font-semibold text-rose-700 uppercase tracking-wider text-[10px] flex items-center gap-1">
                <Clock className="h-3 w-3 text-rose-500" />
                Inactivos (+60 días)
              </span>
              <p className="text-2xl font-black text-rose-700 mt-0.5">
                {customersMetrics.inactiveCustomers}
              </p>
            </div>
          </div>

          {/* Buscador Predictivo y Filtros */}
          <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs space-y-3">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por nombre, CUIT, WhatsApp o patente de vehículo (ej: Scania, AD123XY)..."
                value={customerSearch}
                onChange={(e) => handleCustomerSearchChange(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
              />
            </div>

            {/* Píldoras de Filtro */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
              <span className="text-slate-400 text-[11px] font-semibold">Tipo:</span>
              {['all', 'particular', 'empresa'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setCustomerTypeFilter(t)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    customerTypeFilter === t
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {t === 'all' ? 'Todos' : t === 'particular' ? 'Particulares' : 'Empresas / Talleres'}
                </button>
              ))}

              <span className="text-slate-300 mx-1">|</span>

              <span className="text-slate-400 text-[11px] font-semibold">Estado:</span>
              {[
                { id: 'all', label: 'Todos' },
                { id: 'active', label: 'Activos' },
                { id: 'inactive', label: 'En Riesgo (+60d)' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCustomerStatusFilter(s.id)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    customerStatusFilter === s.id
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {s.label}
                </button>
              ))}

              <span className="text-slate-300 mx-1">|</span>

              <span className="text-slate-400 text-[11px] font-semibold">Ficha:</span>
              {[
                { id: 'all', label: 'Todas' },
                { id: 'phone', label: 'Falta Tel/WhatsApp' },
                { id: 'email', label: 'Falta Mail' },
                { id: 'cuit', label: 'Falta CUIT' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setCustomerMissingFilter(m.id);
                    const next = new URLSearchParams(searchParams);
                    if (m.id === 'all') next.delete('missing');
                    else next.set('missing', m.id);
                    setSearchParams(next, { replace: true });
                  }}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    customerMissingFilter === m.id
                      ? 'bg-orange-600 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabla de Clientes */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
            {loadingCustomers ? (
              <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                <span>Cargando clientes...</span>
              </div>
            ) : customers.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs space-y-2">
                <Users className="h-8 w-8 mx-auto text-slate-300" />
                <p className="font-semibold text-slate-700">No se encontraron clientes</p>
                <p>Probá ajustando la búsqueda o registrá tu primer cliente.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Cliente / Razón Social</th>
                      <th className="px-4 py-3">Contacto & CUIT</th>
                      <th className="px-4 py-3">Vehículos Registrados</th>
                      <th className="px-4 py-3 text-right">Total Comprado</th>
                      <th className="px-4 py-3 text-center">Compras / Presup.</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {customers.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Cliente */}
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleOpenCustomerDetail(c)}
                            className="font-bold text-slate-900 hover:text-orange-600 text-left cursor-pointer"
                          >
                            {c.name}
                          </button>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                                c.customerType === 'empresa'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {c.customerType === 'empresa' ? 'Empresa' : 'Particular'}
                            </span>
                            {c.city && <span className="text-[10px] text-slate-400">· {c.city}</span>}
                          </div>
                        </td>

                        {/* Contacto */}
                        <td className="px-4 py-3 text-slate-600 space-y-0.5">
                          {c.phone ? (
                            <p className="text-emerald-700 font-medium font-mono text-[11px]">
                              {c.phone}
                            </p>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[10px]">
                              Falta WhatsApp/Tel
                            </span>
                          )}
                          {c.email ? (
                            <p className="text-[10px] text-indigo-700 truncate max-w-[180px]">{c.email}</p>
                          ) : (
                            <span className="text-[10px] text-slate-400 block">Sin mail</span>
                          )}
                          {c.cuit ? (
                            <p className="text-[10px] text-slate-500">CUIT: {c.cuit}</p>
                          ) : (
                            <span className="text-[10px] text-amber-700/80 block">Sin CUIT</span>
                          )}
                        </td>

                        {/* Vehículos */}
                        <td className="px-4 py-3">
                          {c.vehiclesCount > 0 ? (
                            <span className="bg-slate-100 text-slate-800 font-mono text-[10px] px-2 py-0.5 rounded font-bold">
                              🚗 {c.vehiclesCount} {c.vehiclesCount === 1 ? 'unidad' : 'unidades'}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">Sin flota</span>
                          )}
                        </td>

                        {/* Total Comprado */}
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                          {formatARS(c.totalSpentCents)}
                        </td>

                        {/* Compras y Presupuestos */}
                        <td className="px-4 py-3 text-center text-slate-600 text-[11px]">
                          <span className="font-bold text-slate-800">{c.salesCount}</span> vtas ·{' '}
                          <span className="font-bold text-slate-800">{c.quotesCount}</span> cotiz.
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-3 text-center">
                          {c.isInactive ? (
                            <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                              Inactivo (+60d)
                            </span>
                          ) : (
                            <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                              Activo
                            </span>
                          )}
                        </td>

                        {/* Acciones */}
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenCustomerDetail(c)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              title="Ver Ficha 360°"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenCustomerEdit(c)}
                              className="p-1.5 text-slate-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer"
                              title="Editar cliente"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modales */}
      <CustomerEditorModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        customerToEdit={customerToEdit}
        onSaved={() => fetchCustomers(customersPage)}
      />

      <CustomerDetailModal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        customer={selectedCustomer}
        onCustomerUpdated={(upd) => {
          setSelectedCustomer(upd);
          fetchCustomers(customersPage);
        }}
        onOpenEdit={(c) => {
          setCustomerToEdit(c);
          setEditorOpen(true);
        }}
      />
    </div>
  );
};
