import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  CreditCard,
  PhoneCall,
  Car,
  Plus,
  Download,
  AlertTriangle,
  CheckCircle2,
  Building2,
  MessageCircle,
  Search,
  Check,
  X,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Landmark,
  Calendar,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { formatARS, parseMoneyToCents } from '../../shared/money';
import { formatDate } from '../../shared/time';
import {
  type CashflowDayRow,
  type PaywayReconciliationItem,
  type PaywayReconciliationStatus,
  type WhatsAppAgendaItem,
  type AutomotivePadronItem,
  type ActiveCompanyStatItem,
  PAYWAY_STATUS_LABELS,
} from '../../shared/finance-and-padron';

export const FinanceAndPadronPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'cashflow' | 'payway' | 'whatsapp' | 'padron'>('cashflow');

  // 1. Estado Cash Flow tipo Excel
  const [loadingCashflow, setLoadingCashflow] = useState(true);
  const [cashflowRows, setCashflowRows] = useState<CashflowDayRow[]>([]);
  const [cfModalOpen, setCfModalOpen] = useState(false);
  const [cfDate, setCfDate] = useState(new Date().toISOString().slice(0, 10));
  const [cfDirection, setCfDirection] = useState<'in' | 'out'>('out');
  const [cfCategory, setCfCategory] = useState<string>('pago_proveedor');
  const [cfDesc, setCfDesc] = useState('');
  const [cfBankOrBox, setCfBankOrBox] = useState('Caja Efectivo');
  const [cfAmountStr, setCfAmountStr] = useState('');
  const [savingCf, setSavingCf] = useState(false);

  // 2. Estado Payway y Sábana Bancaria (Días Pares vs Impares)
  const [loadingPayway, setLoadingPayway] = useState(true);
  const [bankEvenDays, setBankEvenDays] = useState('Banco Patagonia (Cta. Cte. Días Pares)');
  const [bankOddDays, setBankOddDays] = useState('Banco Nación (Cta. Cte. Días Impares)');
  const [savingBanks, setSavingBanks] = useState(false);
  const [paywaySummary, setPaywaySummary] = useState({
    evenBankTotalCents: 0,
    oddBankTotalCents: 0,
    accreditedTotalCents: 0,
    pendingTotalCents: 0,
    missingInPaywayCents: 0,
    unknownPurchaseDisputeCents: 0,
    disputesCount: 0,
  });
  const [cardBreakdown, setCardBreakdown] = useState<any[]>([]);
  const [paywayItems, setPaywayItems] = useState<PaywayReconciliationItem[]>([]);
  const [paywayFilter, setPaywayFilter] = useState<string>('all');
  const [disputeModalItem, setDisputeModalItem] = useState<PaywayReconciliationItem | null>(null);
  const [disputeStatus, setDisputeStatus] = useState<PaywayReconciliationStatus>('unknown_purchase_dispute');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeNotes, setDisputeNotes] = useState('');

  // 3. Estado Agenda WhatsApp
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [agendaItems, setAgendaItems] = useState<WhatsAppAgendaItem[]>([]);
  const [searchAgenda, setSearchAgenda] = useState('');
  const [agendaKindFilter, setAgendaKindFilter] = useState<'all' | 'customer' | 'supplier'>('all');

  // 4. Estado Padrón Automotor y Empresas Activas
  const [loadingPadron, setLoadingPadron] = useState(false);
  const [padronItems, setPadronItems] = useState<AutomotivePadronItem[]>([]);
  const [activeCompanies, setActiveCompanies] = useState<ActiveCompanyStatItem[]>([]);
  const [padronModalOpen, setPadronModalOpen] = useState(false);
  const [padBrand, setPadBrand] = useState('');
  const [padModel, setPadModel] = useState('');
  const [padCategory, setPadCategory] = useState('Pick-up / Flota');
  const [padYears, setPadYears] = useState('2015-2026');
  const [padBearings, setPadBearings] = useState('');
  const [padUnits, setPadUnits] = useState<number>(100);
  const [padNotes, setPadNotes] = useState('');

  const fetchCashflow = async () => {
    setLoadingCashflow(true);
    try {
      const res = await apiFetch<any>('/finance/cashflow');
      setCashflowRows(res.rows || []);
      if (res.bankRules) {
        setBankEvenDays(res.bankRules.bankEvenDays);
        setBankOddDays(res.bankRules.bankOddDays);
      }
    } catch {
      // ignore
    } finally {
      setLoadingCashflow(false);
    }
  };

  const fetchPayway = async () => {
    setLoadingPayway(true);
    try {
      const res = await apiFetch<any>('/finance/payway');
      if (res.bankRules) {
        setBankEvenDays(res.bankRules.bankEvenDays);
        setBankOddDays(res.bankRules.bankOddDays);
      }
      if (res.summary) setPaywaySummary(res.summary);
      setCardBreakdown(res.byCardBrandAndInstallments || []);
      setPaywayItems(res.items || []);
    } catch {
      // ignore
    } finally {
      setLoadingPayway(false);
    }
  };

  const fetchAgenda = async () => {
    setLoadingAgenda(true);
    try {
      const res = await apiFetch<WhatsAppAgendaItem[]>('/whatsapp-agenda');
      setAgendaItems(res || []);
    } catch {
      // ignore
    } finally {
      setLoadingAgenda(false);
    }
  };

  const fetchPadron = async () => {
    setLoadingPadron(true);
    try {
      const res = await apiFetch<any>('/automotive-padron');
      setPadronItems(res.padron || []);
      setActiveCompanies(res.activeCompanies || []);
    } catch {
      // ignore
    } finally {
      setLoadingPadron(false);
    }
  };

  useEffect(() => {
    fetchCashflow();
    fetchPayway();
  }, []);

  useEffect(() => {
    if (activeTab === 'whatsapp') fetchAgenda();
    if (activeTab === 'padron') fetchPadron();
  }, [activeTab]);

  const handleCreateCashflowEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseMoneyToCents(cfAmountStr);
    if (!cents || cents <= 0) {
      alert('Ingresá un monto válido mayor a $0');
      return;
    }
    setSavingCf(true);
    try {
      await apiFetch('/finance/cashflow', {
        method: 'POST',
        body: JSON.stringify({
          entryDate: cfDate,
          direction: cfDirection,
          category: cfCategory,
          description: cfDesc.trim(),
          bankOrBox: cfBankOrBox.trim(),
          amountCents: cents,
          status: 'projected',
        }),
      });
      setCfModalOpen(false);
      setCfDesc('');
      setCfAmountStr('');
      fetchCashflow();
    } catch (err: any) {
      alert(err.message || 'Error al registrar movimiento en la planilla.');
    } finally {
      setSavingCf(false);
    }
  };

  const handleExportCashflowCsv = () => {
    const headers = [
      'Fecha',
      'Dia',
      'Paridad',
      'Banco Acreditacion',
      'Saldo Inicial ($)',
      'Ventas Efvo/Transf ($)',
      'Acreditaciones Payway ($)',
      'Cobros Cta Cte y Cheques ($)',
      'Otros Ingresos ($)',
      'Pagos Proveedores y Fletes ($)',
      'Impuestos y Fijos ($)',
      'Flujo Neto del Dia ($)',
      'Saldo Acumulado Proyectado ($)',
    ];
    const lines = cashflowRows.map((r) =>
      [
        r.date,
        r.dayLabel,
        r.dayParity.toUpperCase(),
        `"${r.assignedBank}"`,
        (r.openingBalanceCents / 100).toFixed(2),
        (r.cashAndTransferSalesCents / 100).toFixed(2),
        (r.paywaySettlementsCents / 100).toFixed(2),
        (r.currentAccountAndChequesInCents / 100).toFixed(2),
        (r.otherIncomeCents / 100).toFixed(2),
        (r.supplierAndFreightOutCents / 100).toFixed(2),
        (r.taxesAndFixedOutCents / 100).toFixed(2),
        (r.netDailyFlowCents / 100).toFixed(2),
        (r.closingProjectedBalanceCents / 100).toFixed(2),
      ].join(','),
    );
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashflow-dia-a-dia-rodamientos-hugo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveBankRules = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBanks(true);
    try {
      await apiFetch('/finance/payway/bank-rules', {
        method: 'PUT',
        body: JSON.stringify({
          bankEvenDays: bankEvenDays.trim(),
          bankOddDays: bankOddDays.trim(),
        }),
      });
      await fetchPayway();
      await fetchCashflow();
    } catch (err: any) {
      alert(err.message || 'Error al guardar regla de bancos.');
    } finally {
      setSavingBanks(false);
    }
  };

  const handleSaveDisputeStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeModalItem) return;
    try {
      await apiFetch(`/finance/payway/${disputeModalItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          reconciliationStatus: disputeStatus,
          disputeReason: disputeReason.trim() || null,
          notes: disputeNotes.trim() || null,
        }),
      });
      setDisputeModalItem(null);
      fetchPayway();
      fetchCashflow();
    } catch (err: any) {
      alert(err.message || 'Error al actualizar estado de Payway.');
    }
  };

  const handleExportVCard = () => {
    const vcards = agendaItems
      .filter((a) => a.normalizedWhatsApp)
      .map(
        (a) =>
          `BEGIN:VCARD\nVERSION:3.0\nFN:${a.formattedPhoneBookName}\nTEL;TYPE=CELL:+${a.normalizedWhatsApp}\nNOTE:${a.detailTag}\nEND:VCARD`,
      )
      .join('\n');

    const blob = new Blob([vcards], { type: 'text/vcard;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agenda-whatsapp-rodamientos-hugo.vcf';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreatePadronEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/automotive-padron', {
        method: 'POST',
        body: JSON.stringify({
          vehicleBrand: padBrand.trim(),
          vehicleModel: padModel.trim(),
          vehicleCategory: padCategory.trim(),
          yearsRange: padYears.trim(),
          commonBearings: padBearings.trim(),
          activeUnitsEst: Number(padUnits) || 50,
          notes: padNotes.trim() || null,
        }),
      });
      setPadronModalOpen(false);
      setPadBrand('');
      setPadModel('');
      setPadBearings('');
      setPadNotes('');
      fetchPadron();
    } catch (err: any) {
      alert(err.message || 'Error al agregar vehículo al padrón.');
    }
  };

  const filteredPaywayItems = paywayItems.filter((it) => {
    if (paywayFilter === 'all') return true;
    if (paywayFilter === 'disputes') {
      return (
        it.reconciliationStatus === 'missing_in_payway' ||
        it.reconciliationStatus === 'unknown_purchase_dispute'
      );
    }
    return it.reconciliationStatus === paywayFilter;
  });

  const filteredAgenda = agendaItems.filter((a) => {
    if (agendaKindFilter !== 'all' && a.contactKind !== agendaKindFilter) return false;
    if (searchAgenda.trim()) {
      const q = searchAgenda.trim().toLowerCase();
      return (
        a.formattedPhoneBookName.toLowerCase().includes(q) ||
        a.phone.toLowerCase().includes(q) ||
        a.detailTag.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Encabezado Principal */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Cash Flow Diario, Conciliación Payway, Agenda WhatsApp y Parque Automotor
          </h2>
          <p className="text-xs text-slate-500">
            Planilla día por día tipo Excel para saber cuánto se va a tener en caja, automatización de bancos (días pares e impares), control de compras desconocidas en Payway, agenda unificada y padrón automotor.
          </p>
        </div>
      </div>

      {/* Pestañas del Bloque 4 */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('cashflow')}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-95 transition-all ${
            activeTab === 'cashflow'
              ? 'bg-emerald-700 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>1. Cash Flow Día por Día (Planilla Excel)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('payway')}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-95 transition-all ${
            activeTab === 'payway'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <CreditCard className="h-4 w-4" />
          <span>2. Payway y Sábana Bancaria (Pares/Impares)</span>
          {paywaySummary.disputesCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-500 text-white">
              {paywaySummary.disputesCount} alertas
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('whatsapp')}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-95 transition-all ${
            activeTab === 'whatsapp'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <PhoneCall className="h-4 w-4" />
          <span>3. Agenda WhatsApp (Clientes y Proveedores)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('padron')}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-95 transition-all ${
            activeTab === 'padron'
              ? 'bg-orange-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Car className="h-4 w-4" />
          <span>4. Padrón de Autos y Empresas Activas</span>
        </button>
      </div>

      {/* PESTAÑA 1: Planilla Cash Flow de Caja del Negocio tipo Excel (Día por Día) */}
      {activeTab === 'cashflow' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Planilla Cash Flow de Caja y Bancos (Seguimiento y Proyección Día por Día)
              </h3>
              <p className="text-xs text-slate-500">
                Muestra día por día con cuánto arranca la caja, cuánto entra por ventas, acreditaciones de tarjetas Payway y cuentas corrientes, menos pagos a proveedores y fletes, para saber cuánto se va a tener cada día.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCfModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all"
              >
                <Plus className="h-4 w-4" />
                <span>+ Agendar Pago / Movimiento en Planilla</span>
              </button>
              <button
                type="button"
                onClick={handleExportCashflowCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all"
              >
                <Download className="h-4 w-4" />
                <span>Descargar Excel (.CSV)</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
            {loadingCashflow ? (
              <div className="p-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                <span>Armando planilla diaria de Cash Flow...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-emerald-950 text-white uppercase text-[10px] font-bold tracking-wider">
                    <tr>
                      <th className="px-3 py-3 border-r border-emerald-800">Día / Fecha</th>
                      <th className="px-3 py-3 border-r border-emerald-800">Paridad y Banco</th>
                      <th className="px-3 py-3 text-right border-r border-emerald-800 bg-slate-900">
                        Saldo Inicial
                      </th>
                      <th className="px-3 py-3 text-right border-r border-emerald-800">
                        + Ventas Efvo / MP
                      </th>
                      <th className="px-3 py-3 text-right border-r border-emerald-800">
                        + Acred. Payway
                      </th>
                      <th className="px-3 py-3 text-right border-r border-emerald-800">
                        + Cta. Cte. / Cheques
                      </th>
                      <th className="px-3 py-3 text-right border-r border-emerald-800">
                        − Prov. / Fletes
                      </th>
                      <th className="px-3 py-3 text-right border-r border-emerald-800">
                        − Impuestos / Fijos
                      </th>
                      <th className="px-3 py-3 text-right border-r border-emerald-800">
                        Flujo Neto Día
                      </th>
                      <th className="px-3 py-3 text-right bg-emerald-900">
                        Saldo Final (Cuánto se tiene)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {cashflowRows.map((r) => {
                      const isToday = r.date === todayStr;
                      return (
                        <tr
                          key={r.date}
                          className={`transition-colors ${
                            isToday
                              ? 'bg-amber-50/90 font-bold ring-1 ring-amber-400'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-3 py-2.5 border-r border-slate-200 font-sans whitespace-nowrap">
                            <span className="font-bold text-slate-900 block">
                              {r.dayLabel} {isToday && <span className="ml-1 px-1.5 py-0.2 rounded bg-orange-600 text-white text-[9px] uppercase">HOY</span>}
                            </span>
                            {r.details.length > 0 && (
                              <span className="text-[10px] text-slate-500 block truncate max-w-[160px]" title={r.details.join(' | ')}>
                                {r.details[0]}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 border-r border-slate-200 font-sans whitespace-nowrap">
                            <span
                              className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-black uppercase mr-1 ${
                                r.dayParity === 'par'
                                  ? 'bg-blue-100 text-blue-900'
                                  : 'bg-purple-100 text-purple-900'
                              }`}
                            >
                              Día {r.dayParity}
                            </span>
                            <span className="text-[10px] text-slate-600 font-medium truncate max-w-[140px] inline-block align-bottom">
                              {r.assignedBank}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right border-r border-slate-200 bg-slate-50/80 text-slate-700 font-semibold">
                            {formatARS(r.openingBalanceCents)}
                          </td>
                          <td className="px-3 py-2.5 text-right border-r border-slate-200 text-emerald-700">
                            {r.cashAndTransferSalesCents > 0 ? `+${formatARS(r.cashAndTransferSalesCents)}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right border-r border-slate-200 text-blue-700">
                            {r.paywaySettlementsCents > 0 ? `+${formatARS(r.paywaySettlementsCents)}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right border-r border-slate-200 text-emerald-800">
                            {r.currentAccountAndChequesInCents + r.otherIncomeCents > 0
                              ? `+${formatARS(r.currentAccountAndChequesInCents + r.otherIncomeCents)}`
                              : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right border-r border-slate-200 text-rose-700">
                            {r.supplierAndFreightOutCents > 0 ? `−${formatARS(r.supplierAndFreightOutCents)}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right border-r border-slate-200 text-rose-700">
                            {r.taxesAndFixedOutCents > 0 ? `−${formatARS(r.taxesAndFixedOutCents)}` : '—'}
                          </td>
                          <td
                            className={`px-3 py-2.5 text-right border-r border-slate-200 font-bold ${
                              r.netDailyFlowCents > 0
                                ? 'text-emerald-700'
                                : r.netDailyFlowCents < 0
                                  ? 'text-rose-700'
                                  : 'text-slate-400'
                            }`}
                          >
                            {r.netDailyFlowCents > 0
                              ? `+${formatARS(r.netDailyFlowCents)}`
                              : r.netDailyFlowCents < 0
                                ? formatARS(r.netDailyFlowCents)
                                : '$ 0,00'}
                          </td>
                          <td className="px-3 py-2.5 text-right bg-emerald-50/60 font-black text-slate-900">
                            {formatARS(r.closingProjectedBalanceCents)}
                          </td>
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

      {/* PESTAÑA 2: Conciliación Payway, Regla de Bancos (Días Pares vs Impares) y Compras Desconocidas */}
      {activeTab === 'payway' && (
        <div className="space-y-4">
          {/* Configurador de Regla de Acreditaciones: Días Pares con un Banco, Días Impares con otro Banco */}
          <form
            onSubmit={handleSaveBankRules}
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-blue-600" />
                  <span>Automatización de Acreditaciones Bancarias (Días Pares vs. Días Impares)</span>
                </h3>
                <p className="text-xs text-slate-500">
                  El sistema asigna automáticamente cada venta con tarjeta del POS al banco que corresponde según si la fecha del día es par o impar.
                </p>
              </div>
              <button
                type="submit"
                disabled={savingBanks}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all shrink-0"
              >
                {savingBanks ? 'Guardando...' : 'Guardar Regla de Bancos'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center justify-between gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-blue-950 uppercase mb-1">
                    Banco para Días Pares (2, 4, 6, 8, 10...)
                  </label>
                  <input
                    type="text"
                    value={bankEvenDays}
                    onChange={(e) => setBankEvenDays(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] text-blue-700 font-semibold block">Liquidado Días Pares</span>
                  <span className="font-mono font-black text-sm text-blue-950">
                    {formatARS(paywaySummary.evenBankTotalCents)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl flex items-center justify-between gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-purple-950 uppercase mb-1">
                    Banco para Días Impares (1, 3, 5, 7, 9...)
                  </label>
                  <input
                    type="text"
                    value={bankOddDays}
                    onChange={(e) => setBankOddDays(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-purple-300 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] text-purple-700 font-semibold block">Liquidado Días Impares</span>
                  <span className="font-mono font-black text-sm text-purple-950">
                    {formatARS(paywaySummary.oddBankTotalCents)}
                  </span>
                </div>
              </div>
            </div>
          </form>

          {/* Tarjetas de Control de Sábana Payway y Compras Desconocidas */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-emerald-200 rounded-xl p-3.5 shadow-2xs">
              <p className="text-[11px] font-semibold text-emerald-700 uppercase">
                Acreditado en Banco (OK)
              </p>
              <p className="text-xl font-black text-emerald-700 font-mono mt-1">
                {formatARS(paywaySummary.accreditedTotalCents)}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Verificado contra sábana bancaria</p>
            </div>

            <div className="bg-white border border-sky-200 rounded-xl p-3.5 shadow-2xs">
              <p className="text-[11px] font-semibold text-sky-700 uppercase">
                En Plazo de Acreditar
              </p>
              <p className="text-xl font-black text-sky-700 font-mono mt-1">
                {formatARS(paywaySummary.pendingTotalCents)}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Débito 24hs / Crédito 48hs</p>
            </div>

            <div className="bg-white border border-amber-300 rounded-xl p-3.5 shadow-2xs">
              <p className="text-[11px] font-bold text-amber-900 uppercase">
                ⚠️ No Figura en Payway
              </p>
              <p className="text-xl font-black text-amber-800 font-mono mt-1">
                {formatARS(paywaySummary.missingInPaywayCents)}
              </p>
              <p className="text-[10px] text-amber-900 font-medium mt-0.5">
                Ventas en POS que no salieron en lote Payway
              </p>
            </div>

            <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 shadow-2xs">
              <p className="text-[11px] font-black text-rose-900 uppercase">
                🚨 Compra Desconocida (Contracargo)
              </p>
              <p className="text-xl font-black text-rose-700 font-mono mt-1">
                {formatARS(paywaySummary.unknownPurchaseDisputeCents)}
              </p>
              <p className="text-[10px] text-rose-900 font-semibold mt-0.5">
                Retenido por Payway por desconocimiento del titular
              </p>
            </div>
          </div>

          {/* Diferenciación de Tarjetas y Cuotas */}
          {cardBreakdown.length > 0 && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
              <h4 className="text-xs font-bold text-slate-800">
                Desglose por Marca de Tarjeta y Cantidad de Cuotas
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {cardBreakdown.map((cb, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">
                        {cb.cardBrand} · {cb.cardType === 'debito' ? 'Débito' : `Crédito ${cb.installments} cuota(s)`}
                      </span>
                      <span className="text-[10px] text-slate-500">{cb.count} operación(es)</span>
                    </div>
                    <span className="font-mono font-bold text-slate-900">{formatARS(cb.grossCents)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla de Conciliación de Sábana Bancaria vs Payway */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Comparador de Sábana de Movimientos Bancarios y Liquidaciones Payway
                </h3>
                <p className="text-xs text-slate-500">
                  Analiza qué ventas ya acreditaron, cuáles no figuran en Payway y los casos donde un cliente desconoce una compra.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {[
                  { id: 'all', label: 'Todas las tarjetas' },
                  { id: 'disputes', label: '🚨 Solo Problemas / Compras Desconocidas' },
                  { id: 'accredited', label: 'Acreditadas OK' },
                  { id: 'pending', label: 'En plazo' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPaywayFilter(f.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all ${
                      paywayFilter === f.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Fecha Venta / Cupón</th>
                    <th className="px-4 py-3">Día Par/Impar → Banco Asignado</th>
                    <th className="px-4 py-3">Tarjeta y Cuotas</th>
                    <th className="px-4 py-3 text-right">Bruto Venta</th>
                    <th className="px-4 py-3 text-right">Neto Payway</th>
                    <th className="px-4 py-3">Estado en Payway / Sábana Bancaria</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPaywayItems.map((it) => (
                    <tr
                      key={it.id}
                      className={
                        it.reconciliationStatus === 'unknown_purchase_dispute'
                          ? 'bg-rose-50/70'
                          : it.reconciliationStatus === 'missing_in_payway'
                            ? 'bg-amber-50/60'
                            : 'hover:bg-slate-50'
                      }
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 block">
                          {it.couponNumber || `OP-${it.id}`}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Venta: {formatDate(it.saleDate)} · Acred: {formatDate(it.expectedPayoutDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-black uppercase mr-1.5 ${
                            it.dayParity === 'par'
                              ? 'bg-blue-100 text-blue-900'
                              : 'bg-purple-100 text-purple-900'
                          }`}
                        >
                          Día {it.dayParity}
                        </span>
                        <span className="font-semibold text-slate-800">{it.assignedBank}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-bold text-slate-900 block">
                          {it.cardBrand} ({it.cardType === 'debito' ? 'Débito' : 'Crédito'})
                        </span>
                        <span className="text-[10px] text-slate-500 font-semibold">
                          {it.installments} {it.installments === 1 ? 'pago' : 'cuotas'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                        {formatARS(it.grossAmountCents)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-slate-900">
                        {formatARS(it.expectedNetCents)}
                      </td>
                      <td className="px-4 py-3 max-w-sm">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            it.reconciliationStatus === 'accredited'
                              ? 'bg-emerald-100 text-emerald-900'
                              : it.reconciliationStatus === 'pending'
                                ? 'bg-sky-100 text-sky-900'
                                : it.reconciliationStatus === 'missing_in_payway'
                                  ? 'bg-amber-200 text-amber-950'
                                  : 'bg-rose-200 text-rose-950'
                          }`}
                        >
                          {PAYWAY_STATUS_LABELS[it.reconciliationStatus]}
                        </span>
                        {it.disputeReason && (
                          <p className="text-[11px] text-rose-900 font-semibold mt-1">
                            {it.disputeReason}
                          </p>
                        )}
                        {it.notes && <p className="text-[10px] text-slate-500 mt-0.5">{it.notes}</p>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setDisputeModalItem(it);
                            setDisputeStatus(it.reconciliationStatus);
                            setDisputeReason(
                              it.disputeReason ||
                                'Contracargo Payway: El cliente desconoció la compra en el resumen de su tarjeta.',
                            );
                            setDisputeNotes(it.notes || '');
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-900 text-slate-800 hover:text-white border border-slate-300 rounded-lg text-[11px] font-bold cursor-pointer active:scale-95 transition-all"
                        >
                          Analizar / Conciliar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: Agenda Oficial de WhatsApp (Ordenar Clientes y Proveedores) */}
      {activeTab === 'whatsapp' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Agenda Centralizada de WhatsApp (Clientes y Proveedores Bien Agendados)
              </h3>
              <p className="text-xs text-slate-500">
                Normaliza todos los números con prefijo uniforme (<strong>CLI - Nombre</strong>, <strong>EMP/TALLER - Nombre</strong> y <strong>PROV - Proveedor</strong>) para descargar e importar en el WhatsApp del local.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportVCard}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all shrink-0"
            >
              <Download className="h-4 w-4" />
              <span>Descargar Agenda para Celulares (.VCF)</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchAgenda}
                onChange={(e) => setSearchAgenda(e.target.value)}
                placeholder="Buscar contacto por nombre, número de teléfono, vehículo o marca que vende..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {[
                { id: 'all', label: `Todos (${agendaItems.length})` },
                {
                  id: 'customer',
                  label: `Clientes y Talleres (${agendaItems.filter((a) => a.contactKind === 'customer').length})`,
                },
                {
                  id: 'supplier',
                  label: `Proveedores (${agendaItems.filter((a) => a.contactKind === 'supplier').length})`,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAgendaKindFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    agendaKindFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Nombre Normalizado para Agenda WhatsApp</th>
                  <th className="px-4 py-3">Teléfono / WhatsApp</th>
                  <th className="px-4 py-3">Vehículos o Marcas que Trabaja</th>
                  <th className="px-4 py-3 text-center">Estado Agenda</th>
                  <th className="px-4 py-3 text-right">Abrir Chat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAgenda.map((item) => (
                  <tr key={item.key} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {item.contactKind === 'supplier' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-900">
                          PROVEEDOR
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900">
                          CLIENTE
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      {item.formattedPhoneBookName}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">{item.phone}</td>
                    <td className="px-4 py-3 text-slate-600">{item.detailTag}</td>
                    <td className="px-4 py-3 text-center">
                      {item.isProperlyNamed ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          ✓ Bien agendado
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                          ⚠️ Completar teléfono/nombre
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.normalizedWhatsApp && (
                        <a
                          href={`https://wa.me/${item.normalizedWhatsApp}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA 4: Padrón de Autos (Estadística Marca/Modelo) y Empresas Activas */}
      {activeTab === 'padron' && (
        <div className="space-y-5">
          {/* Bloque A: Padrón del Parque Automotor por Marca y Modelo */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Padrón del Parque Automotor y Estadística por Marca y Modelo
                </h3>
                <p className="text-xs text-slate-500">
                  Ranking de vehículos más atendidos en Bariloche, qué rodamientos y retenes lleva cada modelo y volumen de consultas/ventas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPadronModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95"
              >
                <Plus className="h-4 w-4" />
                <span>+ Agregar Marca / Modelo al Padrón</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Marca y Modelo de Vehículo</th>
                    <th className="px-4 py-3">Segmento / Años</th>
                    <th className="px-4 py-3">Rodamientos y Retenes que Utiliza</th>
                    <th className="px-4 py-3 text-center">Parque Activo Est.</th>
                    <th className="px-4 py-3 text-center">Consultas / Ventas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {padronItems.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-black text-slate-900">
                          {p.vehicleBrand} {p.vehicleModel}
                        </p>
                        {p.notes && <span className="text-[10px] text-slate-500 block">{p.notes}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-[10px]">
                          {p.vehicleCategory}
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">{p.yearsRange}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-800 max-w-md">
                        {p.commonBearings}
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-slate-700">
                        ~{p.activeUnitsEst} u.
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold text-[11px]">
                          {p.salesCount} ventas · {p.queriesCount} presup.
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bloque B: Estadística de Empresas y Flotas Activas */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Empresas, Talleres y Flotas Activas Registradas ({activeCompanies.length})
              </h3>
              <p className="text-xs text-slate-500">
                Empresas con movimiento activo en presupuestos, ventas o cuenta corriente en San Carlos de Bariloche.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Empresa / Taller / Flota</th>
                    <th className="px-4 py-3">CUIT / Contacto</th>
                    <th className="px-4 py-3">Flota / Vehículos Asociados</th>
                    <th className="px-4 py-3 text-center">Presupuestos</th>
                    <th className="px-4 py-3 text-right">Volumen Operado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeCompanies.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold text-slate-900">{c.name}</td>
                      <td className="px-4 py-3 text-[11px] text-slate-600">
                        {c.cuit ? `CUIT: ${c.cuit}` : '—'} {c.phone ? `· 📱 ${c.phone}` : ''}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{c.vehiclesSummary}</td>
                      <td className="px-4 py-3 text-center font-bold">{c.quotesCount}</td>
                      <td className="px-4 py-3 text-right font-mono font-black text-slate-900">
                        {formatARS(c.salesAndAccountTotalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Agendar Pago o Movimiento en la Planilla Cash Flow */}
      {cfModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                Agendar Movimiento en Cash Flow Diario
              </h3>
              <button type="button" onClick={() => setCfModalOpen(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCashflowEntry} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={cfDate}
                    onChange={(e) => setCfDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipo *</label>
                  <select
                    value={cfDirection}
                    onChange={(e) => setCfDirection(e.target.value as 'in' | 'out')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold"
                  >
                    <option value="out">− Egreso / Pago a realizar</option>
                    <option value="in">+ Ingreso esperado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoría</label>
                  <select
                    value={cfCategory}
                    onChange={(e) => setCfCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="pago_proveedor">Pago a Proveedor</option>
                    <option value="flete_expreso">Pago de Flete / Expreso</option>
                    <option value="impuestos_afip">Impuestos AFIP / Ing. Brutos</option>
                    <option value="alquiler_servicios">Alquiler / Servicios</option>
                    <option value="cobro_cta_cte">Cobro Cuenta Corriente</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monto ($ ARS) *</label>
                  <input
                    type="text"
                    required
                    value={cfAmountStr}
                    onChange={(e) => setCfAmountStr(e.target.value)}
                    placeholder="45000"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-black"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descripción *</label>
                <input
                  type="text"
                  required
                  value={cfDesc}
                  onChange={(e) => setCfDesc(e.target.value)}
                  placeholder="Ej: Pago Expreso Cruz del Sur / Factura Alfa Rodamientos"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCfModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCf}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold cursor-pointer"
                >
                  Guardar en Planilla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Analizar / Conciliar Operación Payway o Compra Desconocida */}
      {disputeModalItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Conciliar Cupón {disputeModalItem.couponNumber} ({disputeModalItem.cardBrand})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Importe: {formatARS(disputeModalItem.grossAmountCents)} · {disputeModalItem.assignedBank}
                </p>
              </div>
              <button type="button" onClick={() => setDisputeModalItem(null)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDisputeStatus} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Estado en Sábana Payway / Banco *
                </label>
                <select
                  value={disputeStatus}
                  onChange={(e) => setDisputeStatus(e.target.value as PaywayReconciliationStatus)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold"
                >
                  <option value="accredited">✓ Acreditado en Sábana Bancaria (OK)</option>
                  <option value="pending">⏱️ En plazo de acreditación</option>
                  <option value="missing_in_payway">⚠️ No figura en Payway (Revisar Cierre de Lote)</option>
                  <option value="unknown_purchase_dispute">
                    🚨 Compra Desconocida por el Cliente (Contracargo Payway)
                  </option>
                </select>
              </div>

              {(disputeStatus === 'unknown_purchase_dispute' ||
                disputeStatus === 'missing_in_payway') && (
                <div>
                  <label className="block font-bold text-rose-900 mb-1">
                    Diagnóstico / Motivo por el que no figura o fue desconocida *
                  </label>
                  <textarea
                    rows={3}
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    className="w-full px-3 py-2 border border-rose-300 bg-rose-50/40 rounded-lg"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Acción a tomar / Notas de seguimiento
                </label>
                <input
                  type="text"
                  value={disputeNotes}
                  onChange={(e) => setDisputeNotes(e.target.value)}
                  placeholder="Ej: Subir cupón firmado y factura al portal de disputas Payway"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setDisputeModalItem(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold cursor-pointer"
                >
                  Guardar Conciliación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Agregar Vehículo al Padrón Automotor */}
      {padronModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                Agregar Marca y Modelo al Padrón Automotor
              </h3>
              <button type="button" onClick={() => setPadronModalOpen(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePadronEntry} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Marca *</label>
                  <input
                    type="text"
                    required
                    value={padBrand}
                    onChange={(e) => setPadBrand(e.target.value)}
                    placeholder="Ej: Chevrolet / Scania"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Modelo *</label>
                  <input
                    type="text"
                    required
                    value={padModel}
                    onChange={(e) => setPadModel(e.target.value)}
                    placeholder="Ej: S10 2.8 CTDI"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Segmento</label>
                  <input
                    type="text"
                    value={padCategory}
                    onChange={(e) => setPadCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Años</label>
                  <input
                    type="text"
                    value={padYears}
                    onChange={(e) => setPadYears(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Rodamientos, Retenes y Crucetas que lleva *
                </label>
                <textarea
                  rows={2}
                  required
                  value={padBearings}
                  onChange={(e) => setPadBearings(e.target.value)}
                  placeholder="Ej: VKBA-3530, Retén palier DBH1359..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPadronModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold cursor-pointer"
                >
                  Guardar en Padrón
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
