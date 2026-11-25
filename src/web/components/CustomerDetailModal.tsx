import React, { useState } from 'react';
import {
  X,
  User,
  Building2,
  Phone,
  Mail,
  MapPin,
  Car,
  ShoppingCart,
  FileText,
  MessageCircle,
  Plus,
  Trash2,
  Calendar,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Loader2,
  Edit2,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { formatARS } from '../../shared/money';
import { formatDate } from '../../shared/time';
import {
  type CustomerProfileDetail,
  type CustomerVehicleInput,
  formatWhatsAppPhone,
  buildCustomerWhatsAppMessage,
} from '../../shared/schemas';

interface CustomerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerProfileDetail | null;
  onCustomerUpdated: (updated: CustomerProfileDetail) => void;
  onOpenEdit: (customer: CustomerProfileDetail) => void;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  isOpen,
  onClose,
  customer,
  onCustomerUpdated,
  onOpenEdit,
}) => {
  const [activeTab, setActiveTab] = useState<'vehicles' | 'sales' | 'quotes'>('vehicles');

  // Formulario para agregar vehículo
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newYear, setNewYear] = useState('');
  const [newEngine, setNewEngine] = useState('');
  const [newPlate, setNewPlate] = useState('');
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);

  // Menú de plantillas de WhatsApp
  const [showWaMenu, setShowWaMenu] = useState(false);

  if (!isOpen || !customer) return null;

  const handleOpenWhatsApp = (intent: 'follow_up' | 'reactivation' | 'fleet_check' | 'direct') => {
    const message = buildCustomerWhatsAppMessage(customer, intent);
    const phone = formatWhatsAppPhone(customer.phone);
    const text = encodeURIComponent(message);
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowWaMenu(false);
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlate.trim() && !newModel.trim()) return;

    setIsAddingVehicle(true);
    try {
      const payload: CustomerVehicleInput = {
        brand: newBrand.trim() || null,
        model: newModel.trim() || null,
        year: newYear ? parseInt(newYear, 10) : null,
        engine: newEngine.trim() || null,
        plate: newPlate.trim() ? newPlate.trim().toUpperCase() : null,
      };

      await apiFetch(`/crm/customers/${customer.id}/vehicles`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Refrescar ficha
      const refreshed = await apiFetch<CustomerProfileDetail>(`/crm/customers/${customer.id}`);
      onCustomerUpdated(refreshed);

      // Limpiar formulario
      setNewBrand('');
      setNewModel('');
      setNewYear('');
      setNewEngine('');
      setNewPlate('');
      setShowAddVehicle(false);
    } catch (err: any) {
      alert(err.message || 'Error al agregar vehículo.');
    } finally {
      setIsAddingVehicle(false);
    }
  };

  const handleDeleteVehicle = async (vehicleId: number) => {
    if (!confirm('¿Estás seguro de quitar este vehículo de la flota?')) return;
    try {
      await apiFetch(`/crm/vehicles/${vehicleId}`, { method: 'DELETE' });
      const refreshed = await apiFetch<CustomerProfileDetail>(`/crm/customers/${customer.id}`);
      onCustomerUpdated(refreshed);
    } catch (err: any) {
      alert(err.message || 'Error al eliminar vehículo.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl flex flex-col overflow-hidden max-h-[94vh]">
        {/* Encabezado Principal */}
        <div className="bg-slate-900 text-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-orange-600/20 text-orange-400 rounded-xl mt-0.5">
              {customer.customerType === 'empresa' ? (
                <Building2 className="h-6 w-6" />
              ) : (
                <User className="h-6 w-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold tracking-tight text-white">
                  {customer.name}
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    customer.customerType === 'empresa'
                      ? 'bg-indigo-900 text-indigo-300 border border-indigo-700'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {customer.customerType === 'empresa' ? 'Empresa / Taller' : 'Particular'}
                </span>
                {customer.isInactive ? (
                  <span className="bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Inactivo (+60 días)
                  </span>
                ) : (
                  <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Cliente Activo
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-400 mt-1 flex-wrap">
                {customer.phone && (
                  <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <Phone className="h-3 w-3" /> {customer.phone}
                  </span>
                )}
                {customer.cuit && <span>CUIT: {customer.cuit}</span>}
                {customer.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-slate-500" /> {customer.city}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Botones de acción rápida */}
          <div className="flex items-center gap-2">
            {/* Dropdown de fidelización WhatsApp */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowWaMenu(!showWaMenu)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Contactar WhatsApp</span>
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </button>

              {showWaMenu && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-20 p-1.5 text-xs text-slate-800 space-y-1">
                  <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Plantillas de Fidelización
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenWhatsApp('follow_up')}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 transition-colors cursor-pointer"
                  >
                    💬 Seguimiento de presupuesto
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenWhatsApp('reactivation')}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 transition-colors cursor-pointer"
                  >
                    👋 Reactivación comercial
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenWhatsApp('fleet_check')}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 transition-colors cursor-pointer"
                  >
                    🚛 Mantenimiento de unidades
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    type="button"
                    onClick={() => handleOpenWhatsApp('direct')}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-100 font-semibold text-slate-900 cursor-pointer"
                  >
                    ✉️ Mensaje libre
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onOpenEdit(customer)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Editar ficha del cliente"
            >
              <Edit2 className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tarjetas KPI de Fidelización (LTV, Ventas, Conversión) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-slate-50 border-b border-slate-200 text-xs">
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Comprado (LTV)</span>
            <p className="text-base font-black text-slate-900 font-mono mt-0.5">
              {formatARS(customer.totalSpentCents)}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400">Ventas en Mostrador</span>
            <p className="text-base font-black text-slate-900 mt-0.5">
              {customer.salesCount} {customer.salesCount === 1 ? 'compra' : 'compras'}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400">Ticket Promedio</span>
            <p className="text-base font-black text-slate-900 font-mono mt-0.5">
              {formatARS(customer.averageTicketCents)}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400">Efectividad Cotizaciones</span>
            <p className="text-base font-black text-indigo-700 mt-0.5">
              {customer.quoteConversionRatePct}% ({customer.quotesAcceptedCount}/{customer.quotesCount})
            </p>
          </div>
        </div>

        {/* Pestañas de Detalle */}
        <div className="flex border-b border-slate-200 px-4 bg-white text-xs font-semibold text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab('vehicles')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'vehicles'
                ? 'border-orange-600 text-orange-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Car className="h-4 w-4" />
            <span>Flota y Vehículos ({customer.vehicles.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sales')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'sales'
                ? 'border-orange-600 text-orange-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <ShoppingCart className="h-4 w-4" />
            <span>Historial de Ventas ({customer.recentSales.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('quotes')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'quotes'
                ? 'border-orange-600 text-orange-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Presupuestos ({customer.recentQuotes.length})</span>
          </button>
        </div>

        {/* Contenido de la Pestaña Activa */}
        <div className="flex-1 overflow-y-auto p-5 text-xs">
          {/* TAB 1: VEHÍCULOS */}
          {activeTab === 'vehicles' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    Unidades y Maquinaria Registrada
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Permite cotizar con rapidez sabiendo el modelo, año y motor de cada rodado.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddVehicle(!showAddVehicle)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-md font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Agregar Vehículo</span>
                </button>
              </div>

              {/* Formulario desplegable para agregar vehículo */}
              {showAddVehicle && (
                <form onSubmit={handleAddVehicle} className="bg-slate-50 border border-slate-300 rounded-lg p-3 space-y-3">
                  <p className="font-bold text-slate-800 text-[11px] uppercase">
                    Nuevo Rodado / Maquinaria
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Marca</label>
                      <input
                        type="text"
                        placeholder="Ej: Ford"
                        value={newBrand}
                        onChange={(e) => setNewBrand(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Modelo</label>
                      <input
                        type="text"
                        placeholder="Ej: Ranger"
                        value={newModel}
                        onChange={(e) => setNewModel(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Año</label>
                      <input
                        type="number"
                        placeholder="2020"
                        value={newYear}
                        onChange={(e) => setNewYear(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Motor</label>
                      <input
                        type="text"
                        placeholder="Ej: 3.2 TDCi"
                        value={newEngine}
                        onChange={(e) => setNewEngine(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Patente</label>
                      <input
                        type="text"
                        placeholder="AD 123 XY"
                        value={newPlate}
                        onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono uppercase"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddVehicle(false)}
                      className="px-2.5 py-1 text-slate-600 hover:bg-slate-200 rounded"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isAddingVehicle}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-orange-600 text-white rounded font-bold hover:bg-orange-700 disabled:opacity-50"
                    >
                      {isAddingVehicle ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      <span>Guardar</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Lista de Vehículos */}
              {customer.vehicles.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-lg text-slate-400">
                  <Car className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p>No hay vehículos registrados para este cliente.</p>
                  <p className="text-[11px] text-slate-400">Podés agregar patentes y modelos para agilizar presupuestos.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {customer.vehicles.map((v) => (
                    <div
                      key={v.id}
                      className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 flex items-start justify-between hover:border-slate-300 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {v.plate ? (
                            <span className="px-2 py-0.5 bg-slate-800 text-white font-mono font-bold text-xs rounded border border-slate-900 uppercase">
                              {v.plate}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">Sin patente</span>
                          )}
                          <span className="font-bold text-slate-900 text-sm">
                            {v.brand || ''} {v.model || ''}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          {v.year ? `Año ${v.year}` : ''}
                          {v.year && v.engine ? ' · ' : ''}
                          {v.engine ? `Motor: ${v.engine}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteVehicle(v.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                        title="Eliminar de la flota"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VENTAS */}
          {activeTab === 'sales' && (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 text-sm">
                Últimas Compras Realizadas en Mostrador
              </h4>
              {customer.recentSales.length === 0 ? (
                <p className="p-8 text-center text-slate-400 italic">
                  Aún no se registraron ventas a nombre de este cliente.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Comprobante</th>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Medio de Pago</th>
                        <th className="px-3 py-2 text-center">Ítems</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customer.recentSales.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono font-bold text-orange-600">
                            {s.saleNumber}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{formatDate(s.createdAt)}</td>
                          <td className="px-3 py-2 text-slate-700">{s.paymentMethodName}</td>
                          <td className="px-3 py-2 text-center text-slate-600">{s.itemsCount}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                            {formatARS(s.totalCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: COTIZACIONES */}
          {activeTab === 'quotes' && (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 text-sm">
                Presupuestos Confeccionados
              </h4>
              {customer.recentQuotes.length === 0 ? (
                <p className="p-8 text-center text-slate-400 italic">
                  No hay cotizaciones previas emitidas para este cliente.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Cotización</th>
                        <th className="px-3 py-2">Vehículo</th>
                        <th className="px-3 py-2">Fecha Emisión</th>
                        <th className="px-3 py-2">Válido Hasta</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customer.recentQuotes.map((q) => (
                        <tr key={q.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono font-bold text-orange-600">
                            {q.quoteNumber}
                          </td>
                          <td className="px-3 py-2 text-slate-800">
                            {q.vehicleSummary || <span className="text-slate-400 italic">Mostrador</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{formatDate(q.createdAt)}</td>
                          <td className="px-3 py-2 text-slate-600">{formatDate(q.validUntil)}</td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                q.status === 'converted'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : q.isExpired
                                  ? 'bg-rose-100 text-rose-800'
                                  : q.status === 'accepted'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {q.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                            {formatARS(q.totalCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Notas Comerciales */}
          {customer.notes && (
            <div className="mt-5 border-t border-slate-200 pt-3 text-slate-600">
              <span className="font-bold text-slate-800 uppercase text-[10px]">
                Observaciones y Notas Internas:
              </span>
              <p className="mt-1 bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-700">
                {customer.notes}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
