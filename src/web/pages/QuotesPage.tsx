import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import {
  FileText,
  Plus,
  Search,
  MessageCircle,
  Mail,
  Phone,
  Printer,
  Edit2,
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Clock,
  Car,
  User,
  Building2,
  Calendar,
  AlertTriangle,
  Loader2,
  Check,
  ChevronRight,
  TrendingUp,
  FileCheck,
  RefreshCw,
} from 'lucide-react';
import { apiFetch, ApiClientError } from '../api/client';
import { formatARS } from '../../shared/money';
import { formatDate, formatDateTime } from '../../shared/time';
import {
  type QuoteDetail,
  type QuoteStatus,
  type FollowUpStatus,
  QUOTE_LOSS_REASONS,
  formatWhatsAppPhone,
  buildWhatsAppQuoteMessage,
  buildMailtoQuoteUrl,
  isQuoteExpired,
} from '../../shared/quotes';
import { QuoteEditorModal } from '../components/QuoteEditorModal';
import { QuotePrintModal } from '../components/QuotePrintModal';
import { useAuth } from '../context/AuthContext';

export const QuotesPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [preloadedCustomer, setPreloadedCustomer] = useState<any | null>(null);

  // Estados de datos
  const [quotes, setQuotes] = useState<QuoteDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [followUpFilter, setFollowUpFilter] = useState<string>('all');
  const searchTimeoutRef = useRef<any>(null);

  // Métricas de embudo comercial de presupuestos
  const [funnelMetrics, setFunnelMetrics] = useState<{
    totalQuotes: number;
    activeQuotes: number;
    expiredQuotes: number;
    convertedQuotes: number;
    pendingCount: number;
    followingCount: number;
    accreditedCount: number;
    notViableCount: number;
    lossReasonsBreakdown: { reason: string; count: number }[];
  }>({
    totalQuotes: 0,
    activeQuotes: 0,
    expiredQuotes: 0,
    convertedQuotes: 0,
    pendingCount: 0,
    followingCount: 0,
    accreditedCount: 0,
    notViableCount: 0,
    lossReasonsBreakdown: [],
  });

  // Modal de Seguimiento Comercial (N° seguimiento, N° vendedor, viabilidad y motivo de no venta)
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [quoteToFollowUp, setQuoteToFollowUp] = useState<QuoteDetail | null>(null);
  const [fuTrackingNumber, setFuTrackingNumber] = useState('');
  const [fuSellerNumber, setFuSellerNumber] = useState('');
  const [fuStatus, setFuStatus] = useState<FollowUpStatus>('following');
  const [fuLossReason, setFuLossReason] = useState('');
  const [fuNotes, setFuNotes] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  // Modales
  const [editorOpen, setEditorOpen] = useState(false);
  const [quoteToEdit, setQuoteToEdit] = useState<QuoteDetail | null>(null);

  const [printOpen, setPrintOpen] = useState(false);
  const [quoteToPrint, setQuoteToPrint] = useState<QuoteDetail | null>(null);

  // Modal de Conversión a Venta
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [quoteToConvert, setQuoteToConvert] = useState<QuoteDetail | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<{ id: number; name: string }[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<number>(1);
  const [convertNotes, setConvertNotes] = useState('');
  const [converting, setConverting] = useState(false);
  const [convertSuccess, setConvertSuccess] = useState<string | null>(null);

  // Cargar medios de pago al montar
  useEffect(() => {
    apiFetch<any[]>('/payment-methods')
      .then((res) => {
        const active = res.filter((m) => m.active);
        setPaymentMethods(active);
        if (active.length > 0) setSelectedPaymentMethodId(active[0].id);
      })
      .catch(() => {});
  }, []);

  // Carga de presupuestos desde la API
  const fetchQuotes = async (targetPage = page) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const qParams = new URLSearchParams({
        page: String(targetPage),
        pageSize: '20',
        status: statusFilter,
        followUpStatus: followUpFilter,
      });
      if (search.trim()) qParams.set('q', search.trim());

      const res = await apiFetch<any>(`/quotes?${qParams.toString()}`);
      setQuotes(res.items || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
      setTotalPages(res.totalPages || 1);
      if (res.metrics) {
        setFunnelMetrics(res.metrics);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar presupuestos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes(1);
  }, [statusFilter, followUpFilter]);

  // Si venimos desde el módulo Clientes con ?newForCustomerId=XX o ?q=COT-...
  useEffect(() => {
    const qUrl = searchParams.get('q');
    if (qUrl && qUrl !== search) {
      setSearch(qUrl);
      fetchQuotes(1);
    }
    const custId = searchParams.get('newForCustomerId');
    if (custId) {
      apiFetch<any>(`/crm/customers/${encodeURIComponent(custId)}`)
        .then((cust) => {
          if (cust?.id) {
            setPreloadedCustomer(cust);
            setQuoteToEdit(null);
            setEditorOpen(true);
          }
        })
        .catch(() => {})
        .finally(() => {
          const next = new URLSearchParams(searchParams);
          next.delete('newForCustomerId');
          setSearchParams(next, { replace: true });
        });
    }
  }, [searchParams]);

  const handleOpenFollowUp = (q: QuoteDetail) => {
    setQuoteToFollowUp(q);
    setFuTrackingNumber(q.trackingNumber || `SEG-${String(q.id).padStart(5, '0')}`);
    setFuSellerNumber(q.sellerNumber || `V-0${q.userId}`);
    setFuStatus(q.followUpStatus || 'following');
    setFuLossReason(q.lossReason || QUOTE_LOSS_REASONS[0]);
    setFuNotes(q.followUpNotes || q.notes || '');
    setFollowUpModalOpen(true);
  };

  const handleSaveFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteToFollowUp) return;
    setSavingFollowUp(true);
    try {
      await apiFetch(`/quotes/${quoteToFollowUp.id}/follow-up`, {
        method: 'PATCH',
        body: JSON.stringify({
          trackingNumber: fuTrackingNumber.trim(),
          sellerNumber: fuSellerNumber.trim(),
          followUpStatus: fuStatus,
          lossReason: fuStatus === 'not_viable' ? fuLossReason.trim() : null,
          followUpNotes: fuNotes.trim() || null,
        }),
      });
      setFollowUpModalOpen(false);
      setQuoteToFollowUp(null);
      fetchQuotes(page);
    } catch (err: any) {
      alert(err.message || 'Error al guardar seguimiento del presupuesto.');
    } finally {
      setSavingFollowUp(false);
    }
  };

  // Búsqueda en tiempo real
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchQuotes(1);
    }, 300);
  };

  const handleOpenNewQuote = () => {
    setPreloadedCustomer(null);
    setQuoteToEdit(null);
    setEditorOpen(true);
  };

  const handleOpenEditQuote = (q: QuoteDetail) => {
    setQuoteToEdit(q);
    setEditorOpen(true);
  };

  const handleOpenPrintQuote = (q: QuoteDetail) => {
    setQuoteToPrint(q);
    setPrintOpen(true);
  };

  // WhatsApp click directo
  const handleWhatsAppClick = (q: QuoteDetail) => {
    if (q.status === 'draft') {
      apiFetch(`/quotes/${q.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'sent' }) })
        .then(() => fetchQuotes(page))
        .catch(() => {});
    }
    const phone = formatWhatsAppPhone(q.customerPhone);
    const text = encodeURIComponent(buildWhatsAppQuoteMessage(q));
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Mail click directo
  const handleMailClick = (q: QuoteDetail) => {
    if (!q.customerEmail) {
      // Si no tiene mail cargado aún, abrir el Comprobante Interno donde puede escribir el mail al vuelo o elegir Gmail Web
      handleOpenPrintQuote(q);
      return;
    }
    if (q.status === 'draft') {
      apiFetch(`/quotes/${q.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'sent' }) })
        .then(() => fetchQuotes(page))
        .catch(() => {});
    }
    window.location.href = buildMailtoQuoteUrl(q);
  };

  // Cambio rápido de estado
  const handleStatusChange = async (q: QuoteDetail, newStatus: QuoteStatus) => {
    try {
      await apiFetch(`/quotes/${q.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      fetchQuotes(page);
    } catch (err: any) {
      alert(err.message || 'Error al cambiar estado del presupuesto.');
    }
  };

  // Iniciar conversión a venta
  const handleStartConvert = (q: QuoteDetail) => {
    setQuoteToConvert(q);
    setConvertNotes('');
    setConvertSuccess(null);
    setConvertModalOpen(true);
  };

  const handleConfirmConvert = async () => {
    if (!quoteToConvert) return;
    setConverting(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<any>(`/quotes/${quoteToConvert.id}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          paymentMethodId: selectedPaymentMethodId,
          notes: convertNotes.trim() || undefined,
        }),
      });

      setConvertSuccess(
        `¡Venta ${res.sale?.saleNumber || ''} registrada exitosamente! Se descontó el stock de mostrador.`,
      );
      setTimeout(() => {
        setConvertModalOpen(false);
        setQuoteToConvert(null);
        setConvertSuccess(null);
        fetchQuotes(page);
      }, 1800);
    } catch (err: any) {
      alert(err.message || 'Error al convertir presupuesto a venta.');
    } finally {
      setConverting(false);
    }
  };

  // Métricas rápidas
  const activeCount = quotes.filter((q) => q.status !== 'converted' && !q.isExpired).length;
  const expiredCount = quotes.filter((q) => q.isExpired || q.status === 'expired').length;
  const convertedCount = quotes.filter((q) => q.status === 'converted').length;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Cotizador de Repuestos
            </h2>
            <span className="bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
              Presupuestos
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Armá presupuestos para vehículos y empresas, envialos al instante por WhatsApp y convertilos a venta de mostrador.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenNewQuote}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Nuevo Presupuesto</span>
        </button>
      </div>

      {/* Tarjetas de Métricas y Embudo de Seguimiento Comercial */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Presupuestos Trabajados
          </p>
          <p className="text-2xl font-black text-slate-900 mt-1">{funnelMetrics.totalQuotes || total}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Total emitidos con N° COT y SEG</p>
        </div>

        <div className="bg-white border border-sky-200 rounded-lg p-3.5 shadow-2xs">
          <p className="text-[11px] font-semibold text-sky-700 uppercase tracking-wider flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            En Seguimiento / Pendientes
          </p>
          <p className="text-2xl font-black text-sky-700 mt-1">
            {(funnelMetrics.followingCount || 0) + (funnelMetrics.pendingCount || 0)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {funnelMetrics.followingCount || 0} seguidos · {funnelMetrics.pendingCount || 0} sin contactar
          </p>
        </div>

        <div className="bg-white border border-emerald-200 rounded-lg p-3.5 shadow-2xs">
          <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Vendidos / Acreditados
          </p>
          <p className="text-2xl font-black text-emerald-700 mt-1">
            {funnelMetrics.accreditedCount || convertedCount}
          </p>
          <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
            Efectividad:{' '}
            {(funnelMetrics.totalQuotes || total) > 0
              ? `${Math.round(((funnelMetrics.accreditedCount || convertedCount) / (funnelMetrics.totalQuotes || total)) * 100)}% concretados`
              : '0%'}
          </p>
        </div>

        <div className="bg-white border border-rose-200 rounded-lg p-3.5 shadow-2xs">
          <p className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider flex items-center gap-1">
            <XCircle className="h-3 w-3 text-rose-500" />
            No Viables / Perdidos
          </p>
          <p className="text-2xl font-black text-rose-700 mt-1">{funnelMetrics.notViableCount || 0}</p>
          <p className="text-[10px] text-slate-500 mt-0.5 truncate">
            {funnelMetrics.lossReasonsBreakdown?.[0]
              ? `Ppal: ${funnelMetrics.lossReasonsBreakdown[0].reason} (${funnelMetrics.lossReasonsBreakdown[0].count})`
              : `${expiredCount} vencidos`}
          </p>
        </div>
      </div>

      {/* Desglose de qué pasó con los presupuestos no vendidos */}
      {funnelMetrics.lossReasonsBreakdown && funnelMetrics.lossReasonsBreakdown.length > 0 && (
        <div className="bg-rose-50/60 border border-rose-200 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-rose-950">
            ¿Qué pasó con los presupuestos que no se vendieron?
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {funnelMetrics.lossReasonsBreakdown.map((item) => (
              <span
                key={item.reason}
                className="px-2 py-0.5 bg-white border border-rose-200 rounded text-[11px] text-rose-900 font-semibold"
              >
                {item.reason}: <strong>{item.count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Barra de Filtros y Búsqueda Predictiva */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          {/* Input de Búsqueda Predictiva */}
          <div className="relative flex-1 w-full">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Buscar por N° (COT-00001), cliente, patente (ej: AF123CD), modelo (ej: Ranger) o asesor..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
            />
          </div>

          {/* Botón de refrescar */}
          <button
            type="button"
            onClick={() => fetchQuotes(page)}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Refrescar lista"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Pestañas de Estado */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100 text-xs">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'sent', label: 'Enviados / En curso' },
            { id: 'accepted', label: 'Aceptados' },
            { id: 'draft', label: 'Borradores' },
            { id: 'converted', label: 'Convertidos a Venta' },
            { id: 'expired', label: 'Vencidos' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-2xs font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de Presupuestos */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            <span>Cargando presupuestos...</span>
          </div>
        ) : quotes.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <FileText className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              No se encontraron presupuestos
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {search
                ? 'Probá modificando los términos de búsqueda o quitando los filtros de estado.'
                : 'Comenzá creando tu primera cotización para fidelizar a los clientes.'}
            </p>
            <button
              type="button"
              onClick={handleOpenNewQuote}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer mt-2"
            >
              <Plus className="h-4 w-4" />
              <span>Crear Nuevo Presupuesto</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">N° Presup. / Seguimiento</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Vehículo / Aplicación</th>
                  <th className="px-4 py-3">Asesor (N° Vend.)</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Seguimiento & Observaciones</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {quotes.map((q) => {
                  const expired = q.isExpired || (q.status !== 'converted' && isQuoteExpired(q.validUntil));

                  // Badge de estado
                  let statusBadge = (
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                      Borrador
                    </span>
                  );
                  if (q.status === 'converted') {
                    statusBadge = (
                      <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                        <Check className="h-3 w-3" /> Venta #{q.convertedSaleId}
                      </span>
                    );
                  } else if (expired) {
                    statusBadge = (
                      <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Vencido
                      </span>
                    );
                  } else if (q.status === 'accepted') {
                    statusBadge = (
                      <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Aceptado
                      </span>
                    );
                  } else if (q.status === 'sent') {
                    statusBadge = (
                      <span className="bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                        Enviado
                      </span>
                    );
                  } else if (q.status === 'rejected') {
                    statusBadge = (
                      <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium text-[10px]">
                        Rechazado
                      </span>
                    );
                  }

                  return (
                    <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* N° Cotización y N° Seguimiento */}
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleOpenPrintQuote(q)}
                          className="font-mono font-bold text-orange-600 hover:text-orange-700 hover:underline cursor-pointer block"
                        >
                          {q.quoteNumber}
                        </button>
                        <span className="inline-block font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 mt-0.5">
                          {q.trackingNumber || `SEG-${String(q.id).padStart(5, '0')}`}
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          {formatDate(q.createdAt)} · {q.items.length} ítem(s)
                        </span>
                      </td>

                      {/* Cliente */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {q.customerType === 'empresa' ? (
                            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          ) : (
                            <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          )}
                          <p className="font-semibold text-slate-900 truncate max-w-[170px]">
                            {q.customerName}
                          </p>
                        </div>
                        <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                          {q.customerPhone && (
                            <span className="text-emerald-700 font-medium inline-flex items-center gap-0.5">
                              <Phone className="h-2.5 w-2.5" />
                              {q.customerPhone}
                            </span>
                          )}
                          {q.customerEmail && (
                            <span className="text-sky-700 font-medium truncate max-w-[140px]" title={q.customerEmail}>
                              · {q.customerEmail}
                            </span>
                          )}
                          {q.customerCuit && <span>· CUIT: {q.customerCuit}</span>}
                        </div>
                      </td>

                      {/* Vehículo */}
                      <td className="px-4 py-3">
                        {q.vehicleBrand || q.vehicleModel || q.vehiclePlate ? (
                          <div className="space-y-0.5">
                            <p className="font-medium text-slate-800">
                              {q.vehicleBrand || ''} {q.vehicleModel || ''}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {q.vehiclePlate && (
                                <span className="bg-slate-100 text-slate-800 px-1 py-0.2 rounded font-bold uppercase mr-1">
                                  {q.vehiclePlate}
                                </span>
                              )}
                              {q.vehicleYear ? `${q.vehicleYear} ` : ''}
                              {q.vehicleEngine ? `· ${q.vehicleEngine}` : ''}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">
                            Mostrador / No indicado
                          </span>
                        )}
                      </td>

                      {/* Asesor y N° de Vendedor */}
                      <td className="px-4 py-3 text-slate-700 text-[11px]">
                        <span className="font-semibold block">{q.userName}</span>
                        <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-bold">
                          Vend: {q.sellerNumber || `V-0${q.userId}`}
                        </span>
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3 text-right">
                        <p className="font-mono font-bold text-slate-900">
                          {formatARS(q.totalCents)}
                        </p>
                        <p className="text-[9px] text-slate-400">
                          {q.includesTax ? 'IVA incl.' : '+ IVA 21%'}
                        </p>
                      </td>

                      {/* Estado de Seguimiento, Acreditación/Viabilidad y Observaciones */}
                      <td className="px-4 py-3 max-w-[230px]">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {statusBadge}
                            {q.followUpStatus === 'accredited' || q.status === 'converted' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900">
                                Acreditado / Viable
                              </span>
                            ) : q.followUpStatus === 'not_viable' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900">
                                No viable
                              </span>
                            ) : q.followUpStatus === 'following' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-900">
                                En seguimiento
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-900">
                                Pendiente seguir
                              </span>
                            )}
                          </div>
                          {q.lossReason && (
                            <p className="text-[10px] text-rose-700 font-semibold truncate" title={q.lossReason}>
                              Motivo: {q.lossReason}
                            </p>
                          )}
                          {(q.followUpNotes || q.notes) && (
                            <p className="text-[10px] text-slate-500 truncate" title={q.followUpNotes || q.notes || ''}>
                              Obs: {q.followUpNotes || q.notes}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {/* Botón Seguimiento Comercial */}
                          <button
                            type="button"
                            onClick={() => handleOpenFollowUp(q)}
                            className="px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-900 text-slate-800 hover:text-white rounded-md transition-colors cursor-pointer active:scale-95"
                            title="Registrar seguimiento, si fue acreditado/viable o motivo de no venta"
                          >
                            Seguimiento
                          </button>
                          {/* Botón WhatsApp */}
                          <button
                            type="button"
                            onClick={() => handleWhatsAppClick(q)}
                            className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg transition-colors cursor-pointer"
                            title="Enviar comprobante interno por WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </button>

                          {/* Botón Mail */}
                          <button
                            type="button"
                            onClick={() => handleMailClick(q)}
                            className="p-1.5 text-sky-600 hover:text-white hover:bg-sky-600 rounded-lg transition-colors cursor-pointer"
                            title="Enviar comprobante interno por Mail"
                          >
                            <Mail className="h-4 w-4" />
                          </button>

                          {/* Botón Imprimir / PDF */}
                          <button
                            type="button"
                            onClick={() => handleOpenPrintQuote(q)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Ver e imprimir presupuesto oficial"
                          >
                            <Printer className="h-4 w-4" />
                          </button>

                          {/* Botón Editar (si no fue convertida a venta) */}
                          {q.status !== 'converted' && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditQuote(q)}
                              className="p-1.5 text-slate-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer"
                              title="Editar cotización"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}

                          {/* Botón Convertir a Venta */}
                          {q.status !== 'converted' && (
                            <button
                              type="button"
                              onClick={() => handleStartConvert(q)}
                              className="p-1.5 text-indigo-600 hover:text-white hover:bg-indigo-600 rounded-lg transition-colors cursor-pointer"
                              title="Convertir presupuesto a Venta de Mostrador"
                            >
                              <ShoppingCart className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>
              Página {page} de {totalPages} ({total} presupuestos)
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => fetchQuotes(page - 1)}
                className="px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => fetchQuotes(page + 1)}
                className="px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Edición / Creación */}
      <QuoteEditorModal
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setPreloadedCustomer(null);
        }}
        quoteToEdit={quoteToEdit}
        initialCustomer={preloadedCustomer}
        onSaved={(saved) => {
          fetchQuotes(1);
          setQuoteToPrint(saved);
          setPrintOpen(true);
        }}
      />

      {/* Modal de Impresión / Comprobante Interno */}
      <QuotePrintModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        quote={quoteToPrint}
        onQuoteSent={() => fetchQuotes(page)}
      />

      {/* Modal de Seguimiento Comercial (N° seguimiento, N° vendedor, viabilidad y observaciones) */}
      {followUpModalOpen && quoteToFollowUp && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Seguimiento de Presupuesto {quoteToFollowUp.quoteNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Cliente: <strong>{quoteToFollowUp.customerName}</strong> · Total:{' '}
                  <strong>{formatARS(quoteToFollowUp.totalCents)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFollowUpModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFollowUp} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    N° de Seguimiento *
                  </label>
                  <input
                    type="text"
                    required
                    value={fuTrackingNumber}
                    onChange={(e) => setFuTrackingNumber(e.target.value)}
                    placeholder="Ej: SEG-00001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    N° de Vendedor / Legajo *
                  </label>
                  <input
                    type="text"
                    required
                    value={fuSellerNumber}
                    onChange={(e) => setFuSellerNumber(e.target.value)}
                    placeholder="Ej: V-01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700">
                  Estado de seguimiento / ¿Fue viable o acreditado? *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'pending', label: 'Pendiente de contactar', color: 'amber' },
                    { id: 'following', label: 'En seguimiento activo', color: 'sky' },
                    { id: 'accredited', label: 'Vendido / Acreditado', color: 'emerald' },
                    { id: 'not_viable', label: 'No viable / Perdido', color: 'rose' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFuStatus(opt.id as FollowUpStatus)}
                      className={`py-2 px-3 rounded-lg border text-left font-semibold transition-all cursor-pointer active:scale-95 ${
                        fuStatus === opt.id
                          ? 'bg-slate-900 text-white border-slate-900 font-bold shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {fuStatus === 'not_viable' && (
                <div className="space-y-1.5 p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <label className="block font-bold text-rose-950">
                    ¿Por qué no salió / no fue viable este presupuesto? *
                  </label>
                  <select
                    value={fuLossReason}
                    onChange={(e) => setFuLossReason(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-rose-300 rounded-lg text-xs font-semibold text-slate-900"
                  >
                    {QUOTE_LOSS_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Observaciones dentro del presupuesto (Cómo se acreditó, respuesta del cliente, etc.)
                </label>
                <textarea
                  rows={3}
                  value={fuNotes}
                  onChange={(e) => setFuNotes(e.target.value)}
                  placeholder="Ej: Se llamó el martes, confirmó que viene mañana con transferencia / Dijo que en otro lado estaba 10% menos..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setFollowUpModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingFollowUp}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold cursor-pointer active:scale-95 transition-all flex items-center gap-1.5"
                >
                  {savingFollowUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span>Guardar Seguimiento</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación: Convertir a Venta */}
      {convertModalOpen && quoteToConvert && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                  <ShoppingCart className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Convertir Presupuesto a Venta
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {quoteToConvert.quoteNumber} · Cliente: {quoteToConvert.customerName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConvertModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {convertSuccess ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
                <p className="text-xs font-bold text-emerald-800">{convertSuccess}</p>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between font-semibold text-slate-700">
                    <span>Total a cobrar en mostrador:</span>
                    <span className="font-mono text-base font-black text-slate-900">
                      {formatARS(quoteToConvert.totalCents)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Ítems a descontar del inventario: {quoteToConvert.items.length} repuestos.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Medio de Pago
                  </label>
                  <select
                    value={selectedPaymentMethodId}
                    onChange={(e) => setSelectedPaymentMethodId(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs focus:ring-2 focus:ring-indigo-500"
                  >
                    {paymentMethods.map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        {pm.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nota de mostrador (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Retira en el local con comprobante COT"
                    value={convertNotes}
                    onChange={(e) => setConvertNotes(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs"
                  />
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900">
                  ⚠️ Esta acción generará una venta formal en el sistema, descontará el stock de los productos catalogados y marcará el presupuesto como <strong>Convertido</strong>.
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setConvertModalOpen(false)}
                    disabled={converting}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmConvert}
                    disabled={converting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {converting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Confirmando...</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Confirmar Venta</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
