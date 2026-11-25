import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Users,
  Wallet,
  FileCheck,
  Receipt,
  PackageCheck,
  Plus,
  Search,
  Printer,
  MessageCircle,
  Mail,
  Phone,
  Check,
  X,
  Building2,
  User,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Eye,
  Edit2,
  Car,
  ShoppingCart,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { formatARS, parseMoneyToCents } from '../../shared/money';
import { formatDate } from '../../shared/time';
import { formatWhatsAppPhone, type QuoteDetail } from '../../shared/quotes';
import {
  type AccountMovementDetail,
  type CustomerDepositDetail,
  type AccountPaymentFormat,
  type DepositStatus,
  type PaymentBreakdownLine,
  type ClientDirectoryItem,
  type OverdueFollowUpItem,
  type Client360Profile,
  PAYMENT_FORMAT_LABELS,
  DEPOSIT_STATUS_LABELS,
} from '../../shared/current-accounts';
import type { CustomerProfileDetail } from '../../shared/crm';
import { CustomerEditorModal } from '../components/CustomerEditorModal';
import { QuotePrintModal } from '../components/QuotePrintModal';
import { Logo } from '../components/Logo';

export const CurrentAccountsPage: React.FC = () => {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'clients' | 'overdue' | 'movements' | 'deposits'>('clients');

  // Directorio unificado de Clientes y Seguimientos Atrasados
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [directorySummary, setDirectorySummary] = useState({
    totalClients: 0,
    overdueFollowUpCount: 0,
    customersWithDebtCount: 0,
    totalReceivableCents: 0,
    openQuotesCount: 0,
    activeDepositsCount: 0,
  });
  const [clients, setClients] = useState<ClientDirectoryItem[]>([]);
  const [overdueFollowUps, setOverdueFollowUps] = useState<OverdueFollowUpItem[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientFilter, setClientFilter] = useState<'all' | 'overdue' | 'debt' | 'quotes' | 'deposits'>('all');

  // Ficha 360° de Cliente seleccionado
  const [profileLoading, setProfileLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Client360Profile | null>(null);
  const [profileTab, setProfileTab] = useState<'account' | 'quotes' | 'deposits' | 'vehicles'>('account');
  const [newVehBrand, setNewVehBrand] = useState('');
  const [newVehModel, setNewVehModel] = useState('');
  const [newVehYear, setNewVehYear] = useState('');
  const [newVehEngine, setNewVehEngine] = useState('');
  const [newVehPlate, setNewVehPlate] = useState('');
  const [savingVeh, setSavingVeh] = useState(false);

  // Modal Crear / Editar Cliente
  const [customerEditorOpen, setCustomerEditorOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<CustomerProfileDetail | null>(null);

  // Visor de Comprobante Interno de Presupuesto directo desde Clientes
  const [quotePrintOpen, setQuotePrintOpen] = useState(false);
  const [quoteToView, setQuoteToView] = useState<QuoteDetail | null>(null);

  // Movimientos de Cuenta Corriente (CMP / REC)
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [movements, setMovements] = useState<AccountMovementDetail[]>([]);
  const [searchAccounts, setSearchAccounts] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('all');

  // Señas (SEN)
  const [loadingDeposits, setLoadingDeposits] = useState(true);
  const [deposits, setDeposits] = useState<CustomerDepositDetail[]>([]);
  const [searchDeposits, setSearchDeposits] = useState('');
  const [depositStatusFilter, setDepositStatusFilter] = useState<string>('all');

  // Modal: Nuevo Compromiso de Pago (Retiro de Mercadería)
  const [commitmentModalOpen, setCommitmentModalOpen] = useState(false);
  const [cmpCustomerId, setCmpCustomerId] = useState<number | null>(null);
  const [cmpCustomerName, setCmpCustomerName] = useState('');
  const [cmpCustomerPhone, setCmpCustomerPhone] = useState('');
  const [cmpCustomerCuit, setCmpCustomerCuit] = useState('');
  const [cmpInvoiceNumber, setCmpInvoiceNumber] = useState('');
  const [cmpRemitoNumber, setCmpRemitoNumber] = useState('');
  const [cmpPromisedDate, setCmpPromisedDate] = useState('');
  const [cmpWithdrawnBy, setCmpWithdrawnBy] = useState('');
  const [cmpItemsSummary, setCmpItemsSummary] = useState('');
  const [cmpAmountStr, setCmpAmountStr] = useState('');
  const [cmpNotes, setCmpNotes] = useState('');
  const [savingCommitment, setSavingCommitment] = useState(false);

  // Modal: Nuevo Recibo de Dinero a Cuenta
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [recCustomerId, setRecCustomerId] = useState<number | null>(null);
  const [recCustomerName, setRecCustomerName] = useState('');
  const [recCustomerPhone, setRecCustomerPhone] = useState('');
  const [recCustomerCuit, setRecCustomerCuit] = useState('');
  const [recInvoiceNumber, setRecInvoiceNumber] = useState('');
  const [recRemitoNumber, setRecRemitoNumber] = useState('');
  const [recLines, setRecLines] = useState<
    {
      format: 'efectivo' | 'transferencia' | 'cheque' | 'mercado_libre' | 'tarjeta';
      amountStr: string;
      reference: string;
      chequeNumber: string;
      chequeBank: string;
      chequeDueDate: string;
    }[]
  >([
    {
      format: 'efectivo',
      amountStr: '',
      reference: '',
      chequeNumber: '',
      chequeBank: '',
      chequeDueDate: '',
    },
  ]);
  const [recNotes, setRecNotes] = useState('');
  const [savingReceipt, setSavingReceipt] = useState(false);

  // Modal: Nueva Seña de Producto a Pedir
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depCustomerId, setDepCustomerId] = useState<number | null>(null);
  const [depCustomerName, setDepCustomerName] = useState('');
  const [depCustomerPhone, setDepCustomerPhone] = useState('');
  const [depProductSku, setDepProductSku] = useState('');
  const [depProductDesc, setDepProductDesc] = useState('');
  const [depBrand, setDepBrand] = useState('');
  const [depSupplierName, setDepSupplierName] = useState('Alfa Rodamientos');
  const [depQuantity, setDepQuantity] = useState<number>(1);
  const [depUnitPriceStr, setDepUnitPriceStr] = useState('');
  const [depDepositAmountStr, setDepDepositAmountStr] = useState('');
  const [depPaymentFormat, setDepPaymentFormat] = useState<'efectivo' | 'transferencia' | 'cheque' | 'mercado_libre' | 'tarjeta'>('efectivo');
  const [depPaymentRef, setDepPaymentRef] = useState('');
  const [depArrivalDate, setDepArrivalDate] = useState('');
  const [depNotes, setDepNotes] = useState('');
  const [savingDeposit, setSavingDeposit] = useState(false);

  // Modales de Impresión (CMP / REC / SEN)
  const [printMovement, setPrintMovement] = useState<AccountMovementDetail | null>(null);
  const [printDeposit, setPrintDeposit] = useState<CustomerDepositDetail | null>(null);

  const fetchClientsDirectory = async () => {
    setLoadingDirectory(true);
    try {
      const params = new URLSearchParams();
      if (clientSearch.trim()) params.set('q', clientSearch.trim());
      if (clientFilter !== 'all') params.set('filter', clientFilter);
      const res = await apiFetch<any>(`/clients/directory?${params.toString()}`);
      if (res.summary) setDirectorySummary(res.summary);
      setClients(res.clients || []);
      setOverdueFollowUps(res.overdueFollowUps || []);
    } catch {
      // ignore
    } finally {
      setLoadingDirectory(false);
    }
  };

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const params = new URLSearchParams();
      if (searchAccounts.trim()) params.set('q', searchAccounts.trim());
      if (movementTypeFilter !== 'all') params.set('movementType', movementTypeFilter);
      const res = await apiFetch<any>(`/current-accounts?${params.toString()}`);
      setMovements(res.movements || []);
    } catch {
      // ignore
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchDeposits = async () => {
    setLoadingDeposits(true);
    try {
      const params = new URLSearchParams();
      if (searchDeposits.trim()) params.set('q', searchDeposits.trim());
      if (depositStatusFilter !== 'all') params.set('status', depositStatusFilter);
      const res = await apiFetch<any>(`/deposits?${params.toString()}`);
      setDeposits(res.items || []);
    } catch {
      // ignore
    } finally {
      setLoadingDeposits(false);
    }
  };

  const openClientProfile = async (customerId: number, initialSubTab?: 'account' | 'quotes' | 'deposits' | 'vehicles') => {
    setProfileLoading(true);
    if (initialSubTab) setProfileTab(initialSubTab);
    try {
      const prof = await apiFetch<Client360Profile>(`/clients/${customerId}/profile`);
      setSelectedProfile(prof);
      if (!initialSubTab) {
        if (prof.quotes.some((q) => q.isOverdueFollowUp)) setProfileTab('quotes');
        else if (prof.accountMovements.length > 0) setProfileTab('account');
        else if (prof.quotes.length > 0) setProfileTab('quotes');
        else if (prof.deposits.length > 0) setProfileTab('deposits');
        else setProfileTab('account');
      }
    } catch (err: any) {
      alert(err.message || 'No se pudo abrir la ficha del cliente.');
    } finally {
      setProfileLoading(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([fetchClientsDirectory(), fetchAccounts(), fetchDeposits()]);
    if (selectedProfile) {
      try {
        const refreshed = await apiFetch<Client360Profile>(`/clients/${selectedProfile.id}/profile`);
        setSelectedProfile(refreshed);
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    fetchClientsDirectory();
  }, [clientFilter]);

  useEffect(() => {
    fetchAccounts();
  }, [movementTypeFilter]);

  useEffect(() => {
    fetchDeposits();
  }, [depositStatusFilter]);

  const handleOpenNewCustomer = () => {
    setCustomerToEdit(null);
    setCustomerEditorOpen(true);
  };

  const handleOpenEditFromProfile = async (prof: Client360Profile) => {
    try {
      const crmDet = await apiFetch<CustomerProfileDetail>(`/crm/customers/${prof.id}`);
      setCustomerToEdit(crmDet);
      setCustomerEditorOpen(true);
    } catch {
      // ignore
    }
  };

  const handleOpenCommitmentFor = (c?: { id?: number | null; name: string; phone?: string | null; cuit?: string | null }) => {
    setCmpCustomerId(c?.id ?? null);
    setCmpCustomerName(c?.name || '');
    setCmpCustomerPhone(c?.phone || '');
    setCmpCustomerCuit(c?.cuit || '');
    setCmpInvoiceNumber('');
    setCmpRemitoNumber('');
    setCmpPromisedDate('');
    setCmpWithdrawnBy('');
    setCmpItemsSummary('');
    setCmpAmountStr('');
    setCmpNotes('');
    setCommitmentModalOpen(true);
  };

  const handleOpenReceiptFor = (c?: { id?: number | null; name: string; phone?: string | null; cuit?: string | null; balanceCents?: number }) => {
    setRecCustomerId(c?.id ?? null);
    setRecCustomerName(c?.name || '');
    setRecCustomerPhone(c?.phone || '');
    setRecCustomerCuit(c?.cuit || '');
    setRecInvoiceNumber('');
    setRecRemitoNumber('');
    setRecLines([
      {
        format: 'efectivo',
        amountStr: c?.balanceCents && c.balanceCents > 0 ? String(c.balanceCents / 100) : '',
        reference: '',
        chequeNumber: '',
        chequeBank: '',
        chequeDueDate: '',
      },
    ]);
    setRecNotes('');
    setReceiptModalOpen(true);
  };

  const handleOpenDepositFor = (c?: { id?: number | null; name: string; phone?: string | null }) => {
    setDepCustomerId(c?.id ?? null);
    setDepCustomerName(c?.name || '');
    setDepCustomerPhone(c?.phone || '');
    setDepProductSku('');
    setDepProductDesc('');
    setDepBrand('');
    setDepQuantity(1);
    setDepUnitPriceStr('');
    setDepDepositAmountStr('');
    setDepNotes('');
    setDepositModalOpen(true);
  };

  const handleOpenQuoteVoucher = async (quoteId: number) => {
    try {
      const q = await apiFetch<QuoteDetail>(`/quotes/${quoteId}`);
      setQuoteToView(q);
      setQuotePrintOpen(true);
    } catch (err: any) {
      alert(err.message || 'No se pudo cargar el comprobante del presupuesto.');
    }
  };

  const handleCreateCommitment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = parseMoneyToCents(cmpAmountStr);
    if (!amountCents || amountCents <= 0) {
      alert('Ingresá un monto válido mayor a $0');
      return;
    }
    setSavingCommitment(true);
    try {
      const created = await apiFetch<AccountMovementDetail>('/current-accounts/commitments', {
        method: 'POST',
        body: JSON.stringify({
          customerId: cmpCustomerId,
          customerName: cmpCustomerName.trim(),
          customerPhone: cmpCustomerPhone.trim() || null,
          customerCuit: cmpCustomerCuit.trim() || null,
          invoiceNumber: cmpInvoiceNumber.trim() || null,
          remitoNumber: cmpRemitoNumber.trim() || null,
          promisedPaymentDate: cmpPromisedDate || null,
          withdrawnByName: cmpWithdrawnBy.trim() || null,
          itemsSummary: cmpItemsSummary.trim(),
          amountCents,
          notes: cmpNotes.trim() || null,
        }),
      });
      setCommitmentModalOpen(false);
      await refreshAll();
      setPrintMovement(created);
    } catch (err: any) {
      alert(err.message || 'Error al registrar compromiso de pago.');
    } finally {
      setSavingCommitment(false);
    }
  };

  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedBreakdown: PaymentBreakdownLine[] = [];
    for (const line of recLines) {
      const cents = parseMoneyToCents(line.amountStr);
      if (cents && cents > 0) {
        parsedBreakdown.push({
          format: line.format,
          amountCents: cents,
          reference: line.reference.trim() || null,
          chequeNumber: line.chequeNumber.trim() || null,
          chequeBank: line.chequeBank.trim() || null,
          chequeDueDate: line.chequeDueDate || null,
        });
      }
    }

    if (parsedBreakdown.length === 0) {
      alert('Ingresá al menos un importe válido en el recibo.');
      return;
    }

    const totalCents = parsedBreakdown.reduce((acc, b) => acc + b.amountCents, 0);
    const primaryFormat: AccountPaymentFormat =
      parsedBreakdown.length > 1 ? 'mixto' : parsedBreakdown[0].format;
    const firstCheque = parsedBreakdown.find((b) => b.format === 'cheque');

    setSavingReceipt(true);
    try {
      const created = await apiFetch<AccountMovementDetail>('/current-accounts/receipts', {
        method: 'POST',
        body: JSON.stringify({
          customerId: recCustomerId,
          customerName: recCustomerName.trim(),
          customerPhone: recCustomerPhone.trim() || null,
          customerCuit: recCustomerCuit.trim() || null,
          invoiceNumber: recInvoiceNumber.trim() || null,
          remitoNumber: recRemitoNumber.trim() || null,
          paymentFormat: primaryFormat,
          breakdown: parsedBreakdown,
          chequeNumber: firstCheque?.chequeNumber || null,
          chequeBank: firstCheque?.chequeBank || null,
          chequeDueDate: firstCheque?.chequeDueDate || null,
          amountCents: totalCents,
          notes: recNotes.trim() || null,
        }),
      });
      setReceiptModalOpen(false);
      await refreshAll();
      setPrintMovement(created);
    } catch (err: any) {
      alert(err.message || 'Error al emitir recibo.');
    } finally {
      setSavingReceipt(false);
    }
  };

  const handleCreateDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const depositCents = parseMoneyToCents(depDepositAmountStr);
    const unitPriceCents = depUnitPriceStr.trim() ? parseMoneyToCents(depUnitPriceStr) || 0 : 0;

    if (!depositCents || depositCents <= 0) {
      alert('Ingresá el monto de la seña dejada por el cliente.');
      return;
    }

    setSavingDeposit(true);
    try {
      const created = await apiFetch<CustomerDepositDetail>('/deposits', {
        method: 'POST',
        body: JSON.stringify({
          customerId: depCustomerId,
          customerName: depCustomerName.trim(),
          customerPhone: depCustomerPhone.trim() || null,
          productSku: depProductSku.trim() || null,
          productDescription: depProductDesc.trim(),
          brand: depBrand.trim() || null,
          supplierName: depSupplierName.trim() || null,
          quantity: Math.max(1, depQuantity),
          estimatedUnitPriceCents: unitPriceCents,
          depositAmountCents: depositCents,
          paymentFormat: depPaymentFormat,
          paymentReference: depPaymentRef.trim() || null,
          estimatedArrivalDate: depArrivalDate || null,
          notes: depNotes.trim() || null,
        }),
      });
      setDepositModalOpen(false);
      await refreshAll();
      setPrintDeposit(created);
    } catch (err: any) {
      alert(err.message || 'Error al registrar seña.');
    } finally {
      setSavingDeposit(false);
    }
  };

  const handleUpdateDepositStatus = async (id: number, status: DepositStatus) => {
    try {
      await apiFetch(`/deposits/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await refreshAll();
    } catch (err: any) {
      alert(err.message || 'Error al actualizar estado de la seña.');
    }
  };

  const handleAddVehicleToProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile) return;
    if (!newVehPlate.trim() && !newVehModel.trim()) return;
    setSavingVeh(true);
    try {
      await apiFetch(`/crm/customers/${selectedProfile.id}/vehicles`, {
        method: 'POST',
        body: JSON.stringify({
          brand: newVehBrand.trim() || null,
          model: newVehModel.trim() || null,
          year: newVehYear ? parseInt(newVehYear, 10) : null,
          engine: newVehEngine.trim() || null,
          plate: newVehPlate.trim() ? newVehPlate.trim().toUpperCase() : null,
        }),
      });
      setNewVehBrand('');
      setNewVehModel('');
      setNewVehYear('');
      setNewVehEngine('');
      setNewVehPlate('');
      await openClientProfile(selectedProfile.id, 'vehicles');
      fetchClientsDirectory();
    } catch (err: any) {
      alert(err.message || 'No se pudo agregar el vehículo.');
    } finally {
      setSavingVeh(false);
    }
  };

  const handleWhatsAppFollowUp = (phone: string | null, name: string, detailText: string) => {
    const cleanPhone = formatWhatsAppPhone(phone);
    const msg = encodeURIComponent(
      `Hola ${name}, te escribimos de Rodamientos Hugo (Bariloche). Queríamos consultarte por ${detailText}. Avisanos si necesitás que te separemos los repuestos para pasar a retirarlos.`,
    );
    const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Encabezado directo sin eyebrow tags */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Clientes</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Padrón y fichas integrales de clientes: cuenta corriente, presupuestos emitidos, señas y control de seguimientos atrasados.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenNewCustomer}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg shadow-xs hover:-translate-y-0.5 active:scale-96 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo Cliente</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenCommitmentFor()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-2xs active:scale-96 transition-all cursor-pointer"
          >
            <FileCheck className="h-3.5 w-3.5 text-amber-400" />
            <span>Retiro Cta. Cte.</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenReceiptFor()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-2xs active:scale-96 transition-all cursor-pointer"
          >
            <Receipt className="h-3.5 w-3.5" />
            <span>Emitir Recibo</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenDepositFor()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg shadow-2xs active:scale-96 transition-all cursor-pointer"
          >
            <PackageCheck className="h-3.5 w-3.5 text-orange-600" />
            <span>Nueva Seña</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de Indicadores Clave */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Clientes Registrados
          </p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {directorySummary.totalClients.toLocaleString('es-AR')}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Fichas activas con historial</p>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('overdue')}
          className={`text-left rounded-xl p-4 border shadow-2xs transition-all cursor-pointer active:scale-96 ${
            overdueFollowUps.length > 0
              ? 'bg-rose-50/70 border-rose-300 hover:bg-rose-50'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-rose-600" />
            <span>Seguimientos Atrasados</span>
          </p>
          <p className="text-2xl font-black text-rose-800 mt-1">{overdueFollowUps.length}</p>
          <p className="text-[11px] text-rose-700 font-medium mt-0.5">
            {overdueFollowUps.length > 0
              ? 'Presupuestos o encargos sin confirmar retiro'
              : 'Todo al día sin atrasos'}
          </p>
        </button>

        <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
            Saldo a Cobrar (Cta. Cte.)
          </p>
          <p className="text-2xl font-black text-slate-900 font-mono mt-1">
            {formatARS(directorySummary.totalReceivableCents)}
          </p>
          <p className="text-[11px] text-amber-800 font-medium mt-0.5">
            {directorySummary.customersWithDebtCount} cliente(s) con saldo deudor
          </p>
        </div>

        <div className="bg-white border border-sky-200 rounded-xl p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-sky-800 uppercase tracking-wider">
            Presupuestos y Señas Activas
          </p>
          <p className="text-2xl font-black text-sky-900 mt-1">
            {directorySummary.openQuotesCount + directorySummary.activeDepositsCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {directorySummary.openQuotesCount} presupuesto(s) · {directorySummary.activeDepositsCount} seña(s)
          </p>
        </div>
      </div>

      {/* Aviso destacado si hay clientes con presupuestos viejos sin retirar */}
      {overdueFollowUps.length > 0 && activeTab !== 'overdue' && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-950">
                Hay {overdueFollowUps.length} seguimiento(s) atrasado(s) pendientes de confirmación
              </p>
              <p className="text-rose-800 mt-0.5">
                Incluye presupuestos hechos hace días donde todavía no se confirmó que el cliente retiró los productos, señas llegadas o compromisos vencidos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('overdue')}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shrink-0 cursor-pointer active:scale-96 transition-all"
          >
            Revisar atrasados ({overdueFollowUps.length})
          </button>
        </div>
      )}

      {/* Pestañas principales del módulo Clientes */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-slate-200/70 rounded-xl border border-slate-200 w-fit">
        {[
          { id: 'clients', label: `Directorio y Fichas (${directorySummary.totalClients})`, icon: Users },
          {
            id: 'overdue',
            label: `Seguimientos Atrasados (${overdueFollowUps.length})`,
            icon: Clock,
          },
          { id: 'movements', label: 'Movimientos Cta. Cte. (CMP / REC)', icon: Wallet },
          { id: 'deposits', label: 'Señas y Encargos (SEN)', icon: PackageCheck },
        ].map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all active:scale-96 ${
                active
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <Icon className={`h-4 w-4 ${t.id === 'overdue' && overdueFollowUps.length > 0 ? 'text-rose-600' : 'text-orange-600'}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* PESTAÑA 1: DIRECTORIO DE CLIENTES Y ACCESO A CADA FICHA */}
      {activeTab === 'clients' && (
        <div className="space-y-3">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchClientsDirectory();
              }}
              className="flex-1 w-full flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Buscar cliente por nombre, razón social, CUIT, teléfono, mail o patente..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg cursor-pointer active:scale-96 transition-all"
              >
                Buscar
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'overdue', label: 'Seguimiento atrasado' },
                { id: 'debt', label: 'Con Cta. Cte.' },
                { id: 'quotes', label: 'Con Presupuestos' },
                { id: 'deposits', label: 'Con Señas' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setClientFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer active:scale-96 transition-all border ${
                    clientFilter === f.id
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loadingDirectory ? (
              <div className="p-12 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
                <span>Cargando directorio de clientes...</span>
              </div>
            ) : clients.length === 0 ? (
              <div className="p-12 text-center space-y-2 text-xs text-slate-500">
                <p className="font-bold text-slate-700">No se encontraron clientes con ese filtro.</p>
                <button
                  type="button"
                  onClick={handleOpenNewCustomer}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white font-bold rounded-lg cursor-pointer active:scale-96"
                >
                  <Plus className="h-4 w-4" />
                  <span>Agregar Nuevo Cliente</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Cliente / Contacto</th>
                      <th className="px-4 py-3 text-right">Saldo Cuenta Corriente</th>
                      <th className="px-4 py-3 text-center">Presupuestos</th>
                      <th className="px-4 py-3 text-center">Señas</th>
                      <th className="px-4 py-3">Estado de Seguimiento</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clients.map((c) => (
                      <tr
                        key={c.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          c.hasOverdueFollowUp ? 'bg-rose-50/30' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {c.customerType === 'empresa' ? (
                              <Building2 className="h-4 w-4 text-indigo-600 shrink-0" />
                            ) : (
                              <User className="h-4 w-4 text-slate-400 shrink-0" />
                            )}
                            <button
                              type="button"
                              onClick={() => openClientProfile(c.id)}
                              className="font-bold text-slate-900 hover:text-orange-600 hover:underline text-left cursor-pointer"
                            >
                              {c.name}
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                            {c.phone && (
                              <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {c.phone}
                              </span>
                            )}
                            {c.email && (
                              <span className="text-sky-700 inline-flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {c.email}
                              </span>
                            )}
                            {c.cuit && <span>CUIT: {c.cuit}</span>}
                            {c.vehiclesCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                                {c.vehiclesCount} veh.
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-right whitespace-nowrap font-mono">
                          {c.accountBalanceCents > 0 ? (
                            <div>
                              <span className="font-black text-rose-700 block">
                                Debe {formatARS(c.accountBalanceCents)}
                              </span>
                              <span className="text-[10px] text-slate-400">Cuenta corriente</span>
                            </div>
                          ) : c.accountBalanceCents < 0 ? (
                            <div>
                              <span className="font-black text-emerald-700 block">
                                A favor {formatARS(Math.abs(c.accountBalanceCents))}
                              </span>
                              <span className="text-[10px] text-slate-400">Saldo entregado</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-medium">$ 0,00</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {c.quotesCount > 0 ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="font-bold text-slate-900">{c.quotesCount} total</span>
                              {c.openQuotesCount > 0 && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-semibold mt-0.5">
                                  {c.openQuotesCount} sin retirar
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {c.depositsCount > 0 ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="font-bold text-slate-900">{c.depositsCount} seña(s)</span>
                              {c.pendingDepositsCount > 0 && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold mt-0.5">
                                  {c.pendingDepositsCount} activa(s)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3 max-w-[260px]">
                          {c.hasOverdueFollowUp ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                                <AlertTriangle className="h-3 w-3" />
                                Seguimiento atrasado
                              </span>
                              <p className="text-[11px] text-rose-800 font-medium line-clamp-2">
                                {c.overdueReasonSummary}
                              </p>
                            </div>
                          ) : c.openQuotesCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold text-[10px]">
                              <Clock className="h-3 w-3" />
                              Presupuesto reciente en curso
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Al día
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openClientProfile(c.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold cursor-pointer active:scale-96 transition-all"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Ver Ficha</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/quotes?newForCustomerId=${c.id}`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-orange-50 hover:bg-orange-600 text-orange-800 hover:text-white border border-orange-200 rounded-lg text-[11px] font-semibold cursor-pointer active:scale-96 transition-all"
                              title="Hacer presupuesto para este cliente"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>Presupuestar</span>
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

      {/* PESTAÑA 2: SEGUIMIENTOS ATRASADOS (PRESUPUESTOS SIN RETIRAR, SEÑAS EN LOCAL, COMPROMISOS VENCIDOS) */}
      {activeTab === 'overdue' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Clientes con Seguimiento Atrasado o Retiro sin Confirmar
              </h2>
              <p className="text-xs text-slate-500">
                Presupuestos emitidos hace 3 o más días (o vencidos) sin confirmar retiro de repuestos, señas llegadas al local y compromisos vencidos.
              </p>
            </div>
          </div>

          {overdueFollowUps.length === 0 ? (
            <div className="p-12 text-center space-y-2 text-xs text-slate-500">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
              <p className="font-bold text-slate-800">No hay seguimientos atrasados pendientes.</p>
              <p>Todos los presupuestos y encargos tienen su retiro o seguimiento al día.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {overdueFollowUps.map((item, idx) => (
                <div
                  key={`${item.kind}-${item.referenceId}-${idx}`}
                  className="p-4 hover:bg-rose-50/30 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-mono font-bold text-[11px]">
                        Hace {item.daysElapsed} día(s)
                      </span>
                      <span className="font-mono font-bold text-slate-800">
                        {item.referenceNumber}
                      </span>
                      <span className="font-bold text-slate-900 text-sm">{item.customerName}</span>
                      {item.vehicleSummary && (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          {item.vehicleSummary}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700 font-medium">{item.summary}</p>
                    <p className="text-[11px] text-slate-500">
                      Importe involucrado: <strong className="text-slate-900">{formatARS(item.amountCents)}</strong>
                      {item.customerPhone ? ` · Tel: ${item.customerPhone}` : ''}
                      {item.customerEmail ? ` · Mail: ${item.customerEmail}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {item.customerId && (
                      <button
                        type="button"
                        onClick={() => openClientProfile(item.customerId!, item.kind === 'quote_uncollected' ? 'quotes' : item.kind === 'deposit_arrived' ? 'deposits' : 'account')}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold cursor-pointer active:scale-96 flex items-center gap-1.5"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Abrir Ficha</span>
                      </button>
                    )}

                    {item.kind === 'quote_uncollected' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenQuoteVoucher(item.referenceId)}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold cursor-pointer active:scale-96 flex items-center gap-1.5"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          <span>Comprobante / Mail</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/quotes?q=${encodeURIComponent(item.referenceNumber)}`)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold cursor-pointer active:scale-96 flex items-center gap-1.5"
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          <span>Confirmar Retiro</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => handleWhatsAppFollowUp(item.customerPhone, item.customerName, item.referenceNumber)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold cursor-pointer active:scale-96 flex items-center gap-1.5"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 3: LIBRO DE MOVIMIENTOS DE CUENTA CORRIENTE (CMP / REC) */}
      {activeTab === 'movements' && (
        <div className="space-y-3">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchAccounts();
              }}
              className="flex-1 w-full flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchAccounts}
                  onChange={(e) => setSearchAccounts(e.target.value)}
                  placeholder="Buscar por cliente, N° CMP/REC, factura, remito o cheque..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg cursor-pointer active:scale-96"
              >
                Filtrar
              </button>
            </form>

            <div className="flex gap-1.5">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'commitment', label: 'Retiros / Compromisos (CMP)' },
                { id: 'receipt', label: 'Recibos de Pago (REC)' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMovementTypeFilter(m.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border ${
                    movementTypeFilter === m.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loadingAccounts ? (
              <div className="p-10 text-center text-xs text-slate-400">Cargando movimientos...</div>
            ) : movements.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">Sin movimientos registrados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">N° / Fecha</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Tipo y Detalle</th>
                      <th className="px-4 py-3 text-right">Importe</th>
                      <th className="px-4 py-3 text-right">Comprobante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movements.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-900 block">{m.movementNumber}</span>
                          <span className="text-[10px] text-slate-400">{formatDate(m.createdAt)}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{m.customerName}</td>
                        <td className="px-4 py-3 max-w-md">
                          {m.movementType === 'commitment' ? (
                            <div>
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                                Retiro / Compromiso
                              </span>
                              <p className="text-slate-700 mt-0.5 truncate">{m.itemsSummary}</p>
                            </div>
                          ) : (
                            <div>
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold text-[10px]">
                                Recibo ({m.paymentFormat ? PAYMENT_FORMAT_LABELS[m.paymentFormat] : 'Pago'})
                              </span>
                              {m.notes && <p className="text-slate-600 mt-0.5 truncate">{m.notes}</p>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold whitespace-nowrap">
                          <span className={m.movementType === 'commitment' ? 'text-rose-700' : 'text-emerald-700'}>
                            {m.movementType === 'commitment' ? '+' : '-'} {formatARS(m.amountCents)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setPrintMovement(m)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                            title="Imprimir comprobante"
                          >
                            <Printer className="h-4 w-4" />
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
      )}

      {/* PESTAÑA 4: SEÑAS DE PRODUCTOS A PEDIR (SEN) */}
      {activeTab === 'deposits' && (
        <div className="space-y-3">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchDeposits();
              }}
              className="flex-1 w-full flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchDeposits}
                  onChange={(e) => setSearchDeposits(e.target.value)}
                  placeholder="Buscar seña por N° SEN, cliente, código o repuesto..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Buscar
              </button>
            </form>

            <select
              value={depositStatusFilter}
              onChange={(e) => setDepositStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-semibold text-slate-700"
            >
              <option value="all">Todos los estados</option>
              <option value="pending_order">Pendiente de pedir</option>
              <option value="ordered_to_supplier">Pedido a proveedor</option>
              <option value="arrived_in_store">Llegó al local (Avisar retiro)</option>
              <option value="delivered_and_settled">Entregado al cliente</option>
            </select>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loadingDeposits ? (
              <div className="p-10 text-center text-xs text-slate-400">Cargando señas...</div>
            ) : deposits.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">No hay señas registradas con ese filtro.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">N° Seña</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Repuesto Encargado</th>
                      <th className="px-4 py-3 text-right">Seña / Saldo</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deposits.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono font-bold text-orange-600">{d.depositNumber}</td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-slate-900 block">{d.customerName}</span>
                          {d.customerPhone && <span className="text-[10px] text-slate-500">{d.customerPhone}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-800 block">
                            {d.quantity}x {d.productDescription}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {d.supplierName || 'Sin proveedor'} {d.brand ? `· ${d.brand}` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                          <span className="font-bold text-emerald-700 block">
                            Seña: {formatARS(d.depositAmountCents)}
                          </span>
                          <span className="text-[10px] text-rose-700 font-semibold">
                            Resta: {formatARS(d.remainingBalanceCents)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={d.status}
                            onChange={(e) => handleUpdateDepositStatus(d.id, e.target.value as DepositStatus)}
                            className="px-2 py-1 border border-slate-300 rounded text-[11px] font-semibold bg-white"
                          >
                            {Object.entries(DEPOSIT_STATUS_LABELS).map(([k, lbl]) => (
                              <option key={k} value={k}>
                                {lbl}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setPrintDeposit(d)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                            title="Imprimir comprobante de seña"
                          >
                            <Printer className="h-4 w-4" />
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
      )}

      {/* MODAL: FICHA INTEGRAL 360° DEL CLIENTE (Cuenta Corriente + Presupuestos + Señas + Vehículos) */}
      {(profileLoading || selectedProfile) && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl flex flex-col overflow-hidden max-h-[94vh]">
            {profileLoading && !selectedProfile ? (
              <div className="p-16 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
                <span>Abriendo ficha integral del cliente...</span>
              </div>
            ) : (
              selectedProfile && (
                <>
                  {/* Cabecera de la Ficha */}
                  <div className="bg-slate-900 text-white p-5 space-y-3 border-b border-slate-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-orange-600/20 text-orange-400 rounded-xl">
                          {selectedProfile.customerType === 'empresa' ? (
                            <Building2 className="h-6 w-6" />
                          ) : (
                            <User className="h-6 w-6" />
                          )}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-bold text-white">{selectedProfile.name}</h3>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold uppercase">
                              {selectedProfile.customerType === 'empresa' ? 'Empresa / Taller' : 'Particular'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 mt-1">
                            {selectedProfile.phone && (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                                <Phone className="h-3 w-3" /> {selectedProfile.phone}
                              </span>
                            )}
                            {selectedProfile.email && (
                              <span className="inline-flex items-center gap-1 text-sky-400">
                                <Mail className="h-3 w-3" /> {selectedProfile.email}
                              </span>
                            )}
                            {selectedProfile.cuit && <span>CUIT: {selectedProfile.cuit}</span>}
                            {selectedProfile.city && <span>· {selectedProfile.city}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/quotes?newForCustomerId=${selectedProfile.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg cursor-pointer active:scale-96"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Hacer Presupuesto</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleOpenCommitmentFor({
                              id: selectedProfile.id,
                              name: selectedProfile.name,
                              phone: selectedProfile.phone,
                              cuit: selectedProfile.cuit,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold rounded-lg cursor-pointer active:scale-96"
                        >
                          <FileCheck className="h-3.5 w-3.5" />
                          <span>Retiro</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleOpenReceiptFor({
                              id: selectedProfile.id,
                              name: selectedProfile.name,
                              phone: selectedProfile.phone,
                              cuit: selectedProfile.cuit,
                              balanceCents: selectedProfile.accountBalanceCents,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer active:scale-96"
                        >
                          <Receipt className="h-3.5 w-3.5" />
                          <span>Recibo</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleOpenDepositFor({
                              id: selectedProfile.id,
                              name: selectedProfile.name,
                              phone: selectedProfile.phone,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg cursor-pointer active:scale-96"
                        >
                          <PackageCheck className="h-3.5 w-3.5" />
                          <span>Seña</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEditFromProfile(selectedProfile)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                          title="Editar datos del cliente"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedProfile(null)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    </div>

                    {/* Alerta dentro de la ficha si tiene seguimiento atrasado */}
                    {selectedProfile.hasOverdueFollowUp && (
                      <div className="bg-rose-950/80 border border-rose-700 rounded-xl px-3.5 py-2.5 text-xs text-rose-100 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Seguimiento atrasado detectado: </span>
                          <span>{selectedProfile.overdueReasons.join(' · ')}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Resumen rápido financiero de la ficha */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-slate-50 border-b border-slate-200 text-xs">
                    <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Saldo Cuenta Corriente</span>
                      <p
                        className={`text-base font-black font-mono mt-0.5 ${
                          selectedProfile.accountBalanceCents > 0
                            ? 'text-rose-700'
                            : selectedProfile.accountBalanceCents < 0
                            ? 'text-emerald-700'
                            : 'text-slate-900'
                        }`}
                      >
                        {selectedProfile.accountBalanceCents > 0
                          ? `Debe ${formatARS(selectedProfile.accountBalanceCents)}`
                          : selectedProfile.accountBalanceCents < 0
                          ? `A favor ${formatARS(Math.abs(selectedProfile.accountBalanceCents))}`
                          : '$ 0,00'}
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Presupuestos Hechos</span>
                      <p className="text-base font-black text-slate-900 mt-0.5">
                        {selectedProfile.quotes.length} cotización(es)
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Señas Registradas</span>
                      <p className="text-base font-black text-slate-900 mt-0.5">
                        {selectedProfile.deposits.length} encargo(s)
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Vehículos / Compras</span>
                      <p className="text-base font-black text-slate-900 mt-0.5">
                        {selectedProfile.vehicles.length} veh. · {selectedProfile.recentSales.length} venta(s)
                      </p>
                    </div>
                  </div>

                  {/* Sub-pestañas de la Ficha */}
                  <div className="flex flex-wrap border-b border-slate-200 px-4 bg-white text-xs font-semibold text-slate-600">
                    {[
                      { id: 'account', label: `Cuenta Corriente (${selectedProfile.accountMovements.length})` },
                      { id: 'quotes', label: `Presupuestos (${selectedProfile.quotes.length})` },
                      { id: 'deposits', label: `Señas (${selectedProfile.deposits.length})` },
                      { id: 'vehicles', label: `Vehículos y Compras (${selectedProfile.vehicles.length})` },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setProfileTab(st.id as any)}
                        className={`py-3 px-3.5 border-b-2 cursor-pointer transition-colors ${
                          profileTab === st.id
                            ? 'border-orange-600 text-orange-600 font-bold'
                            : 'border-transparent hover:text-slate-900'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {/* Contenido de la Ficha */}
                  <div className="flex-1 overflow-y-auto p-5 text-xs space-y-4">
                    {profileTab === 'account' && (
                      <div className="space-y-3">
                        {selectedProfile.accountMovements.length === 0 ? (
                          <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                            Este cliente no registra retiros ni recibos en cuenta corriente.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                            {selectedProfile.accountMovements.map((m) => (
                              <div key={m.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-slate-900">{m.movementNumber}</span>
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        m.movementType === 'commitment'
                                          ? 'bg-amber-100 text-amber-900'
                                          : 'bg-emerald-100 text-emerald-900'
                                      }`}
                                    >
                                      {m.movementType === 'commitment' ? 'Retiro mercadería' : 'Recibo de pago'}
                                    </span>
                                    <span className="text-[11px] text-slate-400">{formatDate(m.createdAt)}</span>
                                  </div>
                                  <p className="text-slate-700 mt-0.5">
                                    {m.itemsSummary || m.notes || (m.paymentFormat ? PAYMENT_FORMAT_LABELS[m.paymentFormat] : '')}
                                  </p>
                                  {m.promisedPaymentDate && (
                                    <p className="text-[11px] text-amber-800 font-medium">
                                      Fecha prometida de pago: {formatDate(m.promisedPaymentDate)}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span
                                    className={`font-mono font-bold text-sm ${
                                      m.movementType === 'commitment' ? 'text-rose-700' : 'text-emerald-700'
                                    }`}
                                  >
                                    {m.movementType === 'commitment' ? '+' : '-'} {formatARS(m.amountCents)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setPrintMovement(m)}
                                    className="p-1.5 text-slate-400 hover:text-slate-900 rounded cursor-pointer"
                                    title="Imprimir comprobante"
                                  >
                                    <Printer className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {profileTab === 'quotes' && (
                      <div className="space-y-3">
                        {selectedProfile.quotes.length === 0 ? (
                          <div className="p-8 text-center space-y-2 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                            <p>Todavía no hay presupuestos emitidos para este cliente.</p>
                            <button
                              type="button"
                              onClick={() => navigate(`/quotes?newForCustomerId=${selectedProfile.id}`)}
                              className="px-3.5 py-1.5 bg-orange-600 text-white font-bold rounded-lg cursor-pointer active:scale-96"
                            >
                              Armar primer presupuesto
                            </button>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                            {selectedProfile.quotes.map((q) => (
                              <div
                                key={q.id}
                                className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                  q.isOverdueFollowUp ? 'bg-rose-50/40' : 'hover:bg-slate-50'
                                }`}
                              >
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono font-bold text-orange-600">{q.quoteNumber}</span>
                                    <span className="text-[11px] text-slate-500">
                                      {formatDate(q.createdAt)} (hace {q.daysElapsed}d)
                                    </span>
                                    {q.status === 'converted' ? (
                                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                        Retirado / Vendido
                                      </span>
                                    ) : q.isOverdueFollowUp ? (
                                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                                        Atrasado: sin confirmar retiro
                                      </span>
                                    ) : q.isPendingPickup ? (
                                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold text-[10px]">
                                        Pendiente de retiro
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px]">
                                        Cerrado
                                      </span>
                                    )}
                                  </div>
                                  {q.vehicleSummary && (
                                    <p className="font-semibold text-slate-800">{q.vehicleSummary}</p>
                                  )}
                                  <p className="text-slate-600 line-clamp-2">{q.itemsSummary}</p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                  <span className="font-mono font-black text-slate-900 text-sm mr-1">
                                    {formatARS(q.totalCents)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenQuoteVoucher(q.id)}
                                    className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold cursor-pointer active:scale-96 flex items-center gap-1"
                                    title="Ver comprobante interno y enviar por Mail o WhatsApp"
                                  >
                                    <Mail className="h-3.5 w-3.5" />
                                    <span>Comprobante</span>
                                  </button>
                                  {q.isPendingPickup && (
                                    <button
                                      type="button"
                                      onClick={() => navigate(`/quotes?q=${encodeURIComponent(q.quoteNumber)}`)}
                                      className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold cursor-pointer active:scale-96 flex items-center gap-1"
                                    >
                                      <ShoppingCart className="h-3.5 w-3.5" />
                                      <span>Confirmar Retiro</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {profileTab === 'deposits' && (
                      <div className="space-y-3">
                        {selectedProfile.deposits.length === 0 ? (
                          <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                            No registra señas ni encargos especiales.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                            {selectedProfile.deposits.map((d) => (
                              <div key={d.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-orange-600">{d.depositNumber}</span>
                                    <span className="text-[11px] text-slate-400">{formatDate(d.createdAt)}</span>
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold text-[10px]">
                                      {DEPOSIT_STATUS_LABELS[d.status]}
                                    </span>
                                  </div>
                                  <p className="font-bold text-slate-900 mt-0.5">
                                    {d.quantity}x {d.productDescription}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    Seña: {formatARS(d.depositAmountCents)} · Resta cobrar: {formatARS(d.remainingBalanceCents)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {d.status !== 'delivered_and_settled' && (
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateDepositStatus(d.id, 'delivered_and_settled')}
                                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold cursor-pointer active:scale-96"
                                    >
                                      Confirmar Retiro
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setPrintDeposit(d)}
                                    className="p-1.5 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
                                  >
                                    <Printer className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {profileTab === 'vehicles' && (
                      <div className="space-y-4">
                        <form onSubmit={handleAddVehicleToProfile} className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-6 gap-2">
                          <input
                            type="text"
                            placeholder="Marca (ej. Ford)"
                            value={newVehBrand}
                            onChange={(e) => setNewVehBrand(e.target.value)}
                            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                          />
                          <input
                            type="text"
                            placeholder="Modelo (ej. Ranger)"
                            value={newVehModel}
                            onChange={(e) => setNewVehModel(e.target.value)}
                            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                          />
                          <input
                            type="number"
                            placeholder="Año"
                            value={newVehYear}
                            onChange={(e) => setNewVehYear(e.target.value)}
                            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                          />
                          <input
                            type="text"
                            placeholder="Motor (ej. 3.2)"
                            value={newVehEngine}
                            onChange={(e) => setNewVehEngine(e.target.value)}
                            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                          />
                          <input
                            type="text"
                            placeholder="Patente (AD123XY)"
                            value={newVehPlate}
                            onChange={(e) => setNewVehPlate(e.target.value.toUpperCase())}
                            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono uppercase"
                          />
                          <button
                            type="submit"
                            disabled={savingVeh}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg cursor-pointer active:scale-96"
                          >
                            + Vehículo
                          </button>
                        </form>

                        {selectedProfile.vehicles.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {selectedProfile.vehicles.map((v) => (
                              <div key={v.id} className="p-3 border border-slate-200 rounded-xl flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <Car className="h-4 w-4 text-orange-600" />
                                  <div>
                                    <p className="font-bold text-slate-900">
                                      {v.brand || ''} {v.model || 'Vehículo'} {v.year ? `(${v.year})` : ''}
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      {v.engine ? `Motor ${v.engine} · ` : ''}
                                      {v.plate ? `Patente: ${v.plate}` : 'Sin patente'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {selectedProfile.recentSales.length > 0 && (
                          <div className="space-y-1.5 pt-2">
                            <h4 className="font-bold text-slate-800">Últimas compras retiradas en mostrador</h4>
                            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                              {selectedProfile.recentSales.map((s) => (
                                <div key={s.id} className="p-2.5 flex items-center justify-between">
                                  <span className="font-mono font-bold text-slate-800">{s.saleNumber}</span>
                                  <span className="text-slate-500">{formatDate(s.createdAt)}</span>
                                  <span className="font-mono font-bold text-slate-900">{formatARS(s.totalCents)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR CLIENTE */}
      <CustomerEditorModal
        isOpen={customerEditorOpen}
        onClose={() => setCustomerEditorOpen(false)}
        customerToEdit={customerToEdit}
        onSaved={(saved) => {
          refreshAll();
          openClientProfile(saved.id);
        }}
      />

      {/* MODAL COMPROBANTE INTERNO DE PRESUPUESTO */}
      <QuotePrintModal
        isOpen={quotePrintOpen}
        onClose={() => setQuotePrintOpen(false)}
        quote={quoteToView}
        onQuoteSent={() => refreshAll()}
      />

      {/* MODAL NUEVO COMPROMISO DE PAGO (CMP) */}
      {commitmentModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">Registrar Retiro en Cuenta Corriente</h3>
              <button type="button" onClick={() => setCommitmentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCommitment} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Cliente / Razón Social *</label>
                  <input
                    type="text"
                    required
                    value={cmpCustomerName}
                    onChange={(e) => setCmpCustomerName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={cmpCustomerPhone}
                    onChange={(e) => setCmpCustomerPhone(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">CUIT</label>
                  <input
                    type="text"
                    value={cmpCustomerCuit}
                    onChange={(e) => setCmpCustomerCuit(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">N° Factura</label>
                  <input
                    type="text"
                    value={cmpInvoiceNumber}
                    onChange={(e) => setCmpInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">N° Remito</label>
                  <input
                    type="text"
                    value={cmpRemitoNumber}
                    onChange={(e) => setCmpRemitoNumber(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mercadería retirada *</label>
                <textarea
                  rows={2}
                  required
                  value={cmpItemsSummary}
                  onChange={(e) => setCmpItemsSummary(e.target.value)}
                  placeholder="Detalle de repuestos retirados..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Importe ($) *</label>
                  <input
                    type="text"
                    required
                    value={cmpAmountStr}
                    onChange={(e) => setCmpAmountStr(e.target.value)}
                    placeholder="45000"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Quien retira</label>
                  <input
                    type="text"
                    value={cmpWithdrawnBy}
                    onChange={(e) => setCmpWithdrawnBy(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Promesa pago</label>
                  <input
                    type="date"
                    value={cmpPromisedDate}
                    onChange={(e) => setCmpPromisedDate(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setCommitmentModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg">
                  Cancelar
                </button>
                <button type="submit" disabled={savingCommitment} className="px-4 py-2 bg-slate-900 text-white font-bold rounded-lg cursor-pointer">
                  {savingCommitment ? 'Guardando...' : 'Guardar Compromiso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EMITIR RECIBO DE PAGO (REC) */}
      {receiptModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">Emitir Recibo de Dinero a Cuenta</h3>
              <button type="button" onClick={() => setReceiptModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateReceipt} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cliente / Razón Social *</label>
                <input
                  type="text"
                  required
                  value={recCustomerName}
                  onChange={(e) => setRecCustomerName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              {recLines.map((ln, idx) => (
                <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={ln.format}
                      onChange={(e) =>
                        setRecLines((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, format: e.target.value as any } : item)),
                        )
                      }
                      className="px-2.5 py-1.5 border border-slate-300 rounded bg-white font-semibold"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="cheque">Cheque / E-Cheq</option>
                      <option value="mercado_libre">Mercado Libre / MP</option>
                      <option value="tarjeta">Tarjeta</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Monto ($)"
                      value={ln.amountStr}
                      onChange={(e) =>
                        setRecLines((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, amountStr: e.target.value } : item)),
                        )
                      }
                      className="px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono font-bold"
                    />
                  </div>
                  {ln.format === 'cheque' && (
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="N° Cheque"
                        value={ln.chequeNumber}
                        onChange={(e) =>
                          setRecLines((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, chequeNumber: e.target.value } : item)),
                          )
                        }
                        className="px-2 py-1 border border-slate-300 rounded bg-white"
                      />
                      <input
                        type="text"
                        placeholder="Banco"
                        value={ln.chequeBank}
                        onChange={(e) =>
                          setRecLines((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, chequeBank: e.target.value } : item)),
                          )
                        }
                        className="px-2 py-1 border border-slate-300 rounded bg-white"
                      />
                      <input
                        type="date"
                        value={ln.chequeDueDate}
                        onChange={(e) =>
                          setRecLines((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, chequeDueDate: e.target.value } : item)),
                          )
                        }
                        className="px-2 py-1 border border-slate-300 rounded bg-white"
                      />
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setRecLines((prev) => [
                    ...prev,
                    { format: 'transferencia', amountStr: '', reference: '', chequeNumber: '', chequeBank: '', chequeDueDate: '' },
                  ])
                }
                className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
              >
                + Sumar otro medio de pago en el mismo recibo
              </button>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observaciones</label>
                <input
                  type="text"
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setReceiptModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg">
                  Cancelar
                </button>
                <button type="submit" disabled={savingReceipt} className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg cursor-pointer">
                  {savingReceipt ? 'Emitiendo...' : 'Emitir Recibo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NUEVA SEÑA (SEN) */}
      {depositModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">Registrar Seña de Producto a Pedir</h3>
              <button type="button" onClick={() => setDepositModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateDeposit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cliente *</label>
                  <input
                    type="text"
                    required
                    value={depCustomerName}
                    onChange={(e) => setDepCustomerName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={depCustomerPhone}
                    onChange={(e) => setDepCustomerPhone(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código / SKU</label>
                  <input
                    type="text"
                    value={depProductSku}
                    onChange={(e) => setDepProductSku(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Repuesto a pedir *</label>
                  <input
                    type="text"
                    required
                    value={depProductDesc}
                    onChange={(e) => setDepProductDesc(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    value={depQuantity}
                    onChange={(e) => setDepQuantity(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-center font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Precio Unit. Est.</label>
                  <input
                    type="text"
                    value={depUnitPriceStr}
                    onChange={(e) => setDepUnitPriceStr(e.target.value)}
                    placeholder="65000"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-emerald-800 mb-1">Seña Dejada ($) *</label>
                  <input
                    type="text"
                    required
                    value={depDepositAmountStr}
                    onChange={(e) => setDepDepositAmountStr(e.target.value)}
                    placeholder="30000"
                    className="w-full px-2.5 py-1.5 border border-emerald-400 bg-emerald-50 rounded-lg font-mono font-bold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Medio de pago</label>
                  <select
                    value={depPaymentFormat}
                    onChange={(e) => setDepPaymentFormat(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="mercado_libre">Mercado Libre / MP</option>
                    <option value="cheque">Cheque</option>
                    <option value="tarjeta">Tarjeta</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Llegada estimada</label>
                  <input
                    type="date"
                    value={depArrivalDate}
                    onChange={(e) => setDepArrivalDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setDepositModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg">
                  Cancelar
                </button>
                <button type="submit" disabled={savingDeposit} className="px-4 py-2 bg-orange-600 text-white font-bold rounded-lg cursor-pointer">
                  {savingDeposit ? 'Guardando...' : 'Guardar Seña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPRESIÓN COMPROMISO / RECIBO */}
      {printMovement && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <Logo className="h-10 w-10" />
                <div>
                  <h4 className="font-black text-base text-slate-900">RODAMIENTOS HUGO</h4>
                  <p className="text-[11px] text-slate-500">Fagnano 1065 · San Carlos de Bariloche</p>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block px-2.5 py-0.5 rounded bg-slate-900 text-white font-mono font-bold text-xs">
                  {printMovement.movementNumber}
                </span>
                <p className="text-[11px] font-bold text-slate-700 mt-1 uppercase">
                  {printMovement.movementType === 'commitment' ? 'COMPROMISO DE PAGO' : 'RECIBO DE DINERO A CUENTA'}
                </p>
                <p className="text-[10px] text-slate-400">{formatDate(printMovement.createdAt)}</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <p>
                  <span className="text-slate-500">Cliente:</span>{' '}
                  <strong className="text-slate-900">{printMovement.customerName}</strong>
                </p>
                {printMovement.customerCuit && (
                  <p>
                    <span className="text-slate-500">CUIT:</span> <strong>{printMovement.customerCuit}</strong>
                  </p>
                )}
              </div>

              {printMovement.itemsSummary && (
                <div className="p-3 border border-slate-200 rounded-lg font-medium text-slate-900">
                  {printMovement.itemsSummary}
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-slate-900 text-white rounded-lg text-sm font-black">
                <span>IMPORTE TOTAL</span>
                <span className="font-mono">{formatARS(printMovement.amountCents)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 no-print">
              <button type="button" onClick={() => window.print()} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                <Printer className="h-4 w-4" />
                <span>Imprimir</span>
              </button>
              <button type="button" onClick={() => setPrintMovement(null)} className="px-4 py-2 bg-orange-600 text-white rounded-lg text-xs font-bold cursor-pointer">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPRESIÓN SEÑA */}
      {printDeposit && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <Logo className="h-10 w-10" />
                <div>
                  <h4 className="font-black text-base text-slate-900">RODAMIENTOS HUGO</h4>
                  <p className="text-[11px] text-slate-500">Fagnano 1065 · San Carlos de Bariloche</p>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block px-2.5 py-0.5 rounded bg-orange-600 text-white font-mono font-bold text-xs">
                  {printDeposit.depositNumber}
                </span>
                <p className="text-[11px] font-bold text-slate-700 mt-1 uppercase">COMPROBANTE DE SEÑA</p>
                <p className="text-[10px] text-slate-400">{formatDate(printDeposit.createdAt)}</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <p>
                Cliente: <strong className="text-slate-900">{printDeposit.customerName}</strong>
              </p>
              <div className="p-3 border border-slate-200 rounded-lg font-bold text-slate-900">
                {printDeposit.quantity}x {printDeposit.productDescription}
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1">
                <div className="flex justify-between font-bold text-emerald-900">
                  <span>Seña entregada:</span>
                  <span className="font-mono">{formatARS(printDeposit.depositAmountCents)}</span>
                </div>
                <div className="flex justify-between font-bold text-rose-800">
                  <span>Resta al retirar:</span>
                  <span className="font-mono">{formatARS(printDeposit.remainingBalanceCents)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 no-print">
              <button type="button" onClick={() => window.print()} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                <Printer className="h-4 w-4" />
                <span>Imprimir</span>
              </button>
              <button type="button" onClick={() => setPrintDeposit(null)} className="px-4 py-2 bg-orange-600 text-white rounded-lg text-xs font-bold cursor-pointer">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
