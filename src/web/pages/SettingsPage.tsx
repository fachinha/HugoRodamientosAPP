import React, { useState, useEffect } from 'react';
import {
  Settings,
  CreditCard,
  Users,
  Upload,
  Download,
  Barcode,
  Check,
  AlertCircle,
  FileSpreadsheet,
  Plus,
  Edit2,
  Trash2,
  Power,
  Loader2,
} from 'lucide-react';
import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/browser';
import { apiFetch, ApiClientError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { formatDateTime } from '../../shared/time';
import { JOB_ROLE_LABELS, type JobRole } from '../../shared/schemas';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<'business' | 'payment' | 'users' | 'official_accounts' | 'import' | 'scanner'>('business');

  // Negocio
  const [businessName, setBusinessName] = useState('Rodamientos Hugo');
  const [maxSellerDiscount, setMaxSellerDiscount] = useState<number>(5);
  const [replenishmentFactor, setReplenishmentFactor] = useState<number>(2);
  const [receiptFooter, setReceiptFooter] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Medios de pago
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [newPmName, setNewPmName] = useState('');

  // Usuarios y Roles Detallados
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newJobRole, setNewJobRole] = useState<JobRole>('vendedor');
  const [newSellerNumber, setNewSellerNumber] = useState('');
  const [newMaxDiscountPct, setNewMaxDiscountPct] = useState<number>(5);
  const [newPassword, setNewPassword] = useState('');
  const [userError, setUserError] = useState<string | null>(null);

  // Control de Cuentas Oficiales y Mails para Hugo
  const [officialAccounts, setOfficialAccounts] = useState<any[]>([]);
  const [accType, setAccType] = useState<'email' | 'whatsapp' | 'mercadolibre' | 'banco_payway' | 'proveedor_portal'>('email');
  const [accIdentifier, setAccIdentifier] = useState('');
  const [accUserName, setAccUserName] = useState('');
  const [accRole, setAccRole] = useState<JobRole>('vendedor');
  const [accScope, setAccScope] = useState('');
  const [accRestrictions, setAccRestrictions] = useState('');

  // Importación
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);

  // Banco de prueba de lector de códigos de barras
  const [scannedLogs, setScannedLogs] = useState<{ code: string; timestamp: string; speedMs: number }[]>([]);
  const [lastScanStart, setLastScanStart] = useState<number>(0);

  useEffect(() => {
    // Cargar settings iniciales
    apiFetch<any>('/settings').then((s) => {
      setBusinessName(s.businessName);
      setMaxSellerDiscount(s.maxSellerDiscountPct);
      setReplenishmentFactor(s.replenishmentFallbackFactor);
      setReceiptFooter(s.receiptFooter);
    });

    // Cargar medios de pago
    loadPaymentMethods();

    // Cargar usuarios y cuentas oficiales si es admin
    if (isAdmin) {
      loadUsers();
      loadOfficialAccounts();
    }
  }, [isAdmin]);

  const loadPaymentMethods = () => {
    apiFetch<any[]>('/payment-methods').then(setPaymentMethods);
  };

  const loadUsers = () => {
    apiFetch<any[]>('/users').then(setUsersList);
  };

  const loadOfficialAccounts = () => {
    apiFetch<any[]>('/official-accounts').then(setOfficialAccounts).catch(() => {});
  };

  const handleCreateOfficialAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accIdentifier.trim() || !accUserName.trim() || !accScope.trim()) return;
    try {
      await apiFetch('/official-accounts', {
        method: 'POST',
        body: JSON.stringify({
          accountType: accType,
          accountIdentifier: accIdentifier.trim(),
          assignedUserName: accUserName.trim(),
          assignedRole: accRole,
          contactsScope: accScope.trim(),
          restrictionsNotes: accRestrictions.trim() || null,
        }),
      });
      setAccIdentifier('');
      setAccUserName('');
      setAccScope('');
      setAccRestrictions('');
      loadOfficialAccounts();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteOfficialAccount = async (id: number) => {
    try {
      await apiFetch(`/official-accounts/${id}`, { method: 'DELETE' });
      loadOfficialAccounts();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(false);
    try {
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          businessName: businessName.trim(),
          maxSellerDiscountPct: Number(maxSellerDiscount),
          replenishmentFallbackFactor: Number(replenishmentFactor),
          receiptFooter: receiptFooter.trim(),
        }),
      });
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPmName.trim()) return;
    try {
      await apiFetch('/payment-methods', {
        method: 'POST',
        body: JSON.stringify({ name: newPmName.trim(), sortOrder: paymentMethods.length + 1 }),
      });
      setNewPmName('');
      loadPaymentMethods();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleTogglePaymentMethod = async (pm: any) => {
    try {
      await apiFetch(`/payment-methods/${pm.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !pm.active }),
      });
      loadPaymentMethods();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError(null);
    const computedRole: 'admin' | 'seller' = newJobRole === 'vendedor' ? 'seller' : 'admin';
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername.trim(),
          displayName: newDisplayName.trim(),
          role: computedRole,
          jobRole: newJobRole,
          sellerNumber: newSellerNumber.trim() || null,
          maxDiscountPct: Number(newMaxDiscountPct),
          password: newPassword,
        }),
      });
      setUserModalOpen(false);
      setNewUsername('');
      setNewDisplayName('');
      setNewSellerNumber('');
      setNewPassword('');
      loadUsers();
    } catch (err: any) {
      setUserError(err.message);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportPreview(null);
    setImportResult(null);

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          setImportRows(results.data as any[]);
          await runPreview(results.data as any[]);
        },
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      try {
        const rows = await readXlsxFile(file);
        if (rows.length < 2) return;
        const headers = (rows[0] as string[]).map((h) => String(h || '').trim());
        const dataRows: any[] = [];
        for (let i = 1; i < rows.length; i++) {
          const rowObj: any = {};
          headers.forEach((h, colIdx) => {
            rowObj[h] = rows[i][colIdx];
          });
          dataRows.push(rowObj);
        }
        setImportRows(dataRows);
        await runPreview(dataRows);
      } catch (err: any) {
        alert('Error al leer el archivo Excel: ' + err.message);
      }
    }
  };

  const runPreview = async (rows: any[]) => {
    try {
      const res = await apiFetch<any>('/imports/products/preview', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      setImportPreview(res);
    } catch (err: any) {
      alert('Error en validación de importación: ' + err.message);
    }
  };

  const handleCommitImport = async () => {
    if (importRows.length === 0) return;
    setImporting(true);
    try {
      const res = await apiFetch<any>('/imports/products/commit', {
        method: 'POST',
        body: JSON.stringify({
          rows: importRows,
          skipInvalid,
          updateExisting,
        }),
      });
      setImportResult(res);
      setImportPreview(null);
      setImportRows([]);
    } catch (err: any) {
      alert('Error al importar: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleExportProducts = async () => {
    try {
      const csv = await apiFetch<string>('/exports/products.csv');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `catalogo-productos-${new Date().toISOString().substring(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleScannerTest = (code: string) => {
    const now = Date.now();
    const speed = lastScanStart > 0 ? now - lastScanStart : 0;
    setLastScanStart(now);

    setScannedLogs((prev) => [
      {
        code,
        timestamp: new Date().toLocaleTimeString('es-AR'),
        speedMs: speed,
      },
      ...prev.slice(0, 19),
    ]);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Configuración del Sistema</h2>
        <p className="text-xs text-slate-500">
          Ajustes comerciales, medios de pago, usuarios, importaciones y diagnóstico de hardware.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('business')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'business'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Parámetros del negocio
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('payment')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'payment'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Medios de pago
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'users'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Usuarios y permisos
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('official_accounts')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'official_accounts'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Cuentas Oficiales y Mails (Control Hugo)
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'import'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Importar y Exportar
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('scanner')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'scanner'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Diagnóstico de Lector (HID)
        </button>
      </div>

      {/* Tab: Parámetros del negocio */}
      {activeTab === 'business' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 max-w-2xl">
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre visible del comercio</label>
              <input
                type="text"
                required
                disabled={!isAdmin}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descuento máximo para vendedores (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  disabled={!isAdmin}
                  value={maxSellerDiscount}
                  onChange={(e) => setMaxSellerDiscount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">0% = requiere autorización de admin</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Factor de reposición básica (x mín.)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  required
                  disabled={!isAdmin}
                  value={replenishmentFactor}
                  onChange={(e) => setReplenishmentFactor(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Sugerencia = (mínimo × {replenishmentFactor}) − stock
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pie de comprobante de venta (impreso en ticket)
              </label>
              <textarea
                rows={2}
                disabled={!isAdmin}
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            {isAdmin && (
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span>Guardar configuración</span>
                </button>
                {settingsSuccess && <span className="text-xs text-emerald-600 font-medium">¡Guardado con éxito!</span>}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Tab: Medios de pago */}
      {activeTab === 'payment' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 max-w-2xl space-y-5">
          <div className="divide-y divide-slate-100">
            {paymentMethods.map((pm) => (
              <div key={pm.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-xs text-slate-900">{pm.name}</p>
                  <p className="text-[10px] text-slate-400">Orden de mostrador: {pm.sortOrder}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      pm.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {pm.active ? 'Activo' : 'Inactivo'}
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleTogglePaymentMethod(pm)}
                      className="p-1 text-slate-400 hover:text-slate-700"
                    >
                      <Power className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {isAdmin && (
            <form onSubmit={handleAddPaymentMethod} className="pt-4 border-t border-slate-200 flex gap-2">
              <input
                type="text"
                required
                value={newPmName}
                onChange={(e) => setNewPmName(e.target.value)}
                placeholder="Nombre de nuevo medio de pago (Ej: Cuenta DNI, QR)..."
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold"
              >
                Agregar medio
              </button>
            </form>
          )}
        </div>
      )}

      {/* Tab: Usuarios */}
      {activeTab === 'users' && isAdmin && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-900">Usuarios del sistema ({usersList.length})</h3>
            <button
              type="button"
              onClick={() => setUserModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg"
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo usuario</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Legajo / N° Vend.</th>
                  <th className="px-4 py-2.5">Usuario</th>
                  <th className="px-4 py-2.5">Nombre visible</th>
                  <th className="px-4 py-2.5">Rol en el Negocio</th>
                  <th className="px-4 py-2.5 text-center">Tope Descuento</th>
                  <th className="px-4 py-2.5 text-center">Estado</th>
                  <th className="px-4 py-2.5">Fecha de alta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono font-bold text-orange-700">
                      {u.sellerNumber || `V-0${u.id}`}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{u.username}</td>
                    <td className="px-4 py-2.5 font-medium">{u.displayName}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                        {JOB_ROLE_LABELS[(u.jobRole as JobRole) || 'vendedor'] || (u.role === 'admin' ? 'Supervisor General' : 'Vendedor')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono font-bold text-slate-800">
                      {u.maxDiscountPct ?? (u.role === 'admin' ? 100 : 5)}%
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          u.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {u.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{new Date(u.createdAt).toLocaleDateString('es-AR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Modal Crear Usuario */}
          {userModalOpen && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
                <h4 className="text-sm font-bold text-slate-900">Crear usuario con rol y permisos específicos</h4>

                {userError && <div className="p-2.5 bg-rose-50 text-rose-700 rounded text-xs">{userError}</div>}

                <form onSubmit={handleCreateUser} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre de usuario *</label>
                      <input
                        type="text"
                        required
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="Ej: lucas_mostrador"
                        className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">N° Vendedor / Legajo</label>
                      <input
                        type="text"
                        value={newSellerNumber}
                        onChange={(e) => setNewSellerNumber(e.target.value)}
                        placeholder="Ej: V-02"
                        className="w-full px-3 py-2 border border-slate-300 rounded text-xs font-mono font-bold"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre y apellido *</label>
                    <input
                      type="text"
                      required
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="Ej: Lucas Pérez"
                      className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Rol en el negocio *</label>
                    <select
                      value={newJobRole}
                      onChange={(e) => {
                        const r = e.target.value as JobRole;
                        setNewJobRole(r);
                        setNewMaxDiscountPct(r === 'vendedor' ? 5 : 100);
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded text-xs font-semibold"
                    >
                      <option value="vendedor">Vendedor (Mostrador y Presupuestos · Tope 5% dto.)</option>
                      <option value="encargado_salon">Encargado de Salón (Stock y Pedidos a Proveedores)</option>
                      <option value="supervisor_ventas">Supervisor de Ventas (Autoriza descuentos &gt;5% y Caja)</option>
                      <option value="administrativo">Administrativo (Facturas, Compras, Pagos e Impuestos)</option>
                      <option value="supervisor_general">Supervisor General (Hugo · Control Total)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tope de descuento propio sin autorización (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={newMaxDiscountPct}
                      onChange={(e) => setNewMaxDiscountPct(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Contraseña inicial (mínimo 10 caracteres) *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={10}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••••"
                      className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setUserModalOpen(false)}
                      className="px-3 py-1.5 border border-slate-300 rounded text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs font-semibold"
                    >
                      Guardar usuario
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Control de Cuentas Oficiales y Mails para Hugo */}
      {activeTab === 'official_accounts' && isAdmin && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Control de Mails y Cuentas Oficiales del Negocio (Auditoría para Hugo)
              </h3>
              <p className="text-xs text-slate-500">
                Registro centralizado de qué empleado utiliza cada correo oficial, línea de WhatsApp o cuenta comercial, con qué clientes o proveedores se comunica y sus restricciones.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">Tipo / Cuenta Oficial</th>
                    <th className="px-4 py-2.5">Persona que la usa</th>
                    <th className="px-4 py-2.5">Con quiénes se comunica (Alcance)</th>
                    <th className="px-4 py-2.5">Restricciones definidas por Hugo</th>
                    <th className="px-4 py-2.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {officialAccounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-900 text-white mb-1">
                          {acc.accountType}
                        </span>
                        <p className="font-mono font-bold text-slate-900">{acc.accountIdentifier}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{acc.assignedUserName}</p>
                        <span className="text-[10px] text-slate-500">
                          {JOB_ROLE_LABELS[(acc.assignedRole as JobRole) || 'vendedor'] || acc.assignedRole}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs text-slate-700">{acc.contactsScope}</td>
                      <td className="px-4 py-3 max-w-xs">
                        {acc.restrictionsNotes ? (
                          <span className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 px-2 py-1 rounded block">
                            {acc.restrictionsNotes}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Sin restricciones adicionales</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteOfficialAccount(acc.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          title="Eliminar asignación"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form onSubmit={handleCreateOfficialAccount} className="pt-4 border-t border-slate-200 space-y-3">
              <h4 className="text-xs font-bold text-slate-800">
                Registrar nueva cuenta oficial o mail asignado
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tipo de cuenta</label>
                  <select
                    value={accType}
                    onChange={(e) => setAccType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="email">Correo Electrónico (Email)</option>
                    <option value="whatsapp">Línea WhatsApp del Local</option>
                    <option value="mercadolibre">MercadoLibre / MercadoPago</option>
                    <option value="banco_payway">Portal Banco / Payway</option>
                    <option value="proveedor_portal">Portal de Pedidos de Proveedor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Mail / Teléfono / Cuenta Oficial *
                  </label>
                  <input
                    type="text"
                    required
                    value={accIdentifier}
                    onChange={(e) => setAccIdentifier(e.target.value)}
                    placeholder="Ej: compras@rodamientoshugo.com.ar"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Persona responsable que la usa *
                  </label>
                  <input
                    type="text"
                    required
                    value={accUserName}
                    onChange={(e) => setAccUserName(e.target.value)}
                    placeholder="Ej: Martín (Encargado de Salón)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Rol asignado</label>
                  <select
                    value={accRole}
                    onChange={(e) => setAccRole(e.target.value as JobRole)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="supervisor_general">Supervisor General (Hugo)</option>
                    <option value="administrativo">Administrativo</option>
                    <option value="supervisor_ventas">Supervisor de Ventas</option>
                    <option value="encargado_salon">Encargado de Salón</option>
                    <option value="vendedor">Vendedor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    ¿Con qué personas / proveedores / clientes se comunica? *
                  </label>
                  <input
                    type="text"
                    required
                    value={accScope}
                    onChange={(e) => setAccScope(e.target.value)}
                    placeholder="Ej: Pedidos a Alfa Rodamientos y reclamos de entregas"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Restricción de uso establecida por Hugo
                  </label>
                  <input
                    type="text"
                    value={accRestrictions}
                    onChange={(e) => setAccRestrictions(e.target.value)}
                    placeholder="Ej: Solo pedidos autorizados, sin acceso a pagos"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all"
                >
                  Registrar Cuenta Oficial
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tab: Importar y Exportar */}
      {activeTab === 'import' && isAdmin && (
        <div className="space-y-6">
          {/* Exportación */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Exportar catálogo completo de productos</h3>
              <p className="text-xs text-slate-500">
                Descarga un archivo CSV con todos los artículos, códigos de barra, precios, costos y stock actual.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportProducts}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>Descargar CSV</span>
            </button>
          </div>

          {/* Importación */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Importación masiva de productos (CSV o Excel)</h3>
              <p className="text-xs text-slate-500">
                El archivo debe contener las columnas: <code>sku</code>, <code>codigo_barras</code>, <code>nombre</code>,{' '}
                <code>precio_venta</code>, <code>costo</code>, <code>stock_inicial</code>, <code>stock_minimo</code>,{' '}
                <code>marca</code>, <code>categoria</code>.
              </p>
            </div>

            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50/50 transition-colors">
              <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <label className="cursor-pointer text-xs font-semibold text-orange-600 hover:underline block">
                <span>Elegir archivo CSV o Excel (.xlsx)</span>
                <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileSelect} className="hidden" />
              </label>
              <p className="text-[11px] text-slate-400 mt-1">Hasta 1.000 filas por archivo para garantizar consistencia.</p>
            </div>

            {/* Vista previa de importación */}
            {importPreview && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900">
                    Vista previa de validación (dry-run): {importPreview.totalRows} filas analizadas
                  </h4>
                  <div className="flex gap-2">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                      {importPreview.validRowsCount} válidas
                    </span>
                    {importPreview.invalidRowsCount > 0 && (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded">
                        {importPreview.invalidRowsCount} con errores
                      </span>
                    )}
                    {importPreview.existingSkuCount > 0 && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                        {importPreview.existingSkuCount} ya existen en catálogo
                      </span>
                    )}
                  </div>
                </div>

                {importPreview.issues.length > 0 && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-800 space-y-1 max-h-36 overflow-y-auto">
                    <p className="font-bold">Observaciones detectadas:</p>
                    {importPreview.issues.map((iss: any, idx: number) => (
                      <p key={idx}>
                        Fila {iss.rowNumber}: {iss.message}
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-4 pt-2 text-xs text-slate-700">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipInvalid}
                      onChange={(e) => setSkipInvalid(e.target.checked)}
                      className="rounded text-orange-600"
                    />
                    <span>Omitir filas inválidas e importar las válidas</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                      className="rounded text-orange-600"
                    />
                    <span>Actualizar precios y datos de productos existentes (sin tocar su stock actual)</span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setImportPreview(null)}
                    className="px-3 py-1.5 border border-slate-300 rounded text-xs"
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={handleCommitImport}
                    disabled={importing}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold flex items-center gap-1"
                  >
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    <span>Confirmar importación a la base</span>
                  </button>
                </div>
              </div>
            )}

            {importResult && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
                <p className="font-bold">✅ Importación finalizada con éxito</p>
                <p>
                  {importResult.imported} producto(s) creados, {importResult.updated} actualizados, {importResult.skipped}{' '}
                  omitidos.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Diagnóstico de Lector HID */}
      {activeTab === 'scanner' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4 max-w-3xl">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Banco de prueba para lector físico de códigos (HID)</h3>
            <p className="text-xs text-slate-500">
              Verificá el comportamiento de tu pistola de mostrador: recepción de ceros iniciales, sufijo Enter y
              prevención de doble disparo.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <BarcodeScanner
              onScan={(code) => {
                handleScannerTest(code);
                return true;
              }}
              placeholder="Dispará el lector sobre cualquier código de barras..."
              autoFocus
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-700">Registro de lecturas en tiempo real</span>
              {scannedLogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScannedLogs([])}
                  className="text-[11px] text-rose-600 hover:underline"
                >
                  Limpiar registro
                </button>
              )}
            </div>

            {scannedLogs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-lg">
                No se registraron lecturas todavía. Conectá el lector USB y dispará contra un repuesto.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto font-mono text-xs">
                {scannedLogs.map((log, i) => (
                  <div key={i} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <Barcode className="h-4 w-4 text-orange-600" />
                      <span className="font-bold text-slate-900">{log.code}</span>
                      <span className="text-[10px] text-slate-400">({log.code.length} caracteres)</span>
                    </div>
                    <span className="text-slate-500 text-[11px]">{log.timestamp}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
