import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Building2,
  Phone,
  Mail,
  MapPin,
  Car,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import type {
  CustomerCreateInput,
  CustomerUpdateInput,
  CustomerProfileDetail,
  CustomerType,
} from '../../shared/crm';

interface CustomerEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerToEdit: CustomerProfileDetail | null;
  onSaved: (savedCustomer: CustomerProfileDetail) => void;
}

export const CustomerEditorModal: React.FC<CustomerEditorModalProps> = ({
  isOpen,
  onClose,
  customerToEdit,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType>('particular');
  const [phone, setPhone] = useState('');
  const [cuit, setCuit] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('San Carlos de Bariloche');
  const [notes, setNotes] = useState('');

  // Vehículo inicial (solo para creación nueva)
  const [addInitialVehicle, setAddInitialVehicle] = useState(false);
  const [vehBrand, setVehBrand] = useState('');
  const [vehModel, setVehModel] = useState('');
  const [vehYear, setVehYear] = useState('');
  const [vehEngine, setVehEngine] = useState('');
  const [vehPlate, setVehPlate] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);

    if (customerToEdit) {
      setName(customerToEdit.name);
      setCustomerType(customerToEdit.customerType);
      setPhone(customerToEdit.phone || '');
      setCuit(customerToEdit.cuit || '');
      setEmail(customerToEdit.email || '');
      setAddress(customerToEdit.address || '');
      setCity(customerToEdit.city || 'San Carlos de Bariloche');
      setNotes(customerToEdit.notes || '');
      setAddInitialVehicle(false);
    } else {
      setName('');
      setCustomerType('particular');
      setPhone('');
      setCuit('');
      setEmail('');
      setAddress('');
      setCity('San Carlos de Bariloche');
      setNotes('');
      setAddInitialVehicle(false);
      setVehBrand('');
      setVehModel('');
      setVehYear('');
      setVehEngine('');
      setVehPlate('');
    }
  }, [isOpen, customerToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('El nombre o razón social es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (customerToEdit) {
        const payload: CustomerUpdateInput = {
          name: name.trim(),
          customerType,
          phone: phone.trim() || null,
          cuit: cuit.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          city: city.trim() || 'San Carlos de Bariloche',
          notes: notes.trim() || null,
        };

        const res = await apiFetch<CustomerProfileDetail>(`/crm/customers/${customerToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onSaved(res);
      } else {
        const vehicles = addInitialVehicle && (vehPlate.trim() || vehModel.trim() || vehBrand.trim())
          ? [
              {
                brand: vehBrand.trim() || null,
                model: vehModel.trim() || null,
                year: vehYear ? parseInt(vehYear, 10) : null,
                engine: vehEngine.trim() || null,
                plate: vehPlate.trim() ? vehPlate.trim().toUpperCase() : null,
              },
            ]
          : undefined;

        const payload: CustomerCreateInput = {
          name: name.trim(),
          customerType,
          phone: phone.trim() || null,
          cuit: cuit.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          city: city.trim() || 'San Carlos de Bariloche',
          notes: notes.trim() || null,
          vehicles,
        };

        const res = await apiFetch<CustomerProfileDetail>('/crm/customers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onSaved(res);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar el cliente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Cabecera */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-orange-600/20 text-orange-400 rounded-lg">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                {customerToEdit ? `Editar Cliente #${customerToEdit.id}` : 'Nuevo Cliente / Empresa'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Ficha comercial para fidelización y seguimiento en Hugo Repuestos
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Tipo de Cliente */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-2.5">
            <span className="font-semibold text-slate-700">Tipo de Cuenta</span>
            <div className="flex rounded-md bg-slate-200 p-0.5 font-medium">
              <button
                type="button"
                onClick={() => setCustomerType('particular')}
                className={`px-3 py-1 rounded transition-all cursor-pointer ${
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
                className={`px-3 py-1 rounded transition-all cursor-pointer ${
                  customerType === 'empresa'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Empresa / Taller
              </button>
            </div>
          </div>

          {/* Nombre y CUIT */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Nombre y Apellido / Razón Social *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Transporte Patagonia S.R.L. / Juan Pérez"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                WhatsApp / Teléfono
              </label>
              <input
                type="tel"
                placeholder="Ej: 294 4629707"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                Para fidelización por WhatsApp
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                CUIT / DNI
              </label>
              <input
                type="text"
                placeholder="Ej: 30-71122334-9"
                value={cuit}
                onChange={(e) => setCuit(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Email y Ubicación */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                placeholder="Ej: compras@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ciudad</label>
              <input
                type="text"
                placeholder="San Carlos de Bariloche"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Dirección / Taller
              </label>
              <input
                type="text"
                placeholder="Ej: Fagnano 1065 / Parque Industrial Bariloche"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Observaciones comerciales */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Notas y Preferencias del Cliente
            </label>
            <textarea
              rows={2}
              placeholder="Ej: Taller mecánico de confianza. Pide siempre marca SKF para ruedas. Descuento habitual 10% en efectivo."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
            />
          </div>

          {/* Vehículo inicial (solo para creación nueva) */}
          {!customerToEdit && (
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-800">
                  <Car className="h-4 w-4 text-orange-600" />
                  <span className="font-semibold text-slate-800">
                    Asociar Vehículo Inicial (Opcional)
                  </span>
                </div>
                <input
                  type="checkbox"
                  id="addInitVeh"
                  checked={addInitialVehicle}
                  onChange={(e) => setAddInitialVehicle(e.target.checked)}
                  className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                />
              </div>

              {addInitialVehicle && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  <div>
                    <label className="block font-medium text-slate-600 mb-0.5">Marca</label>
                    <input
                      type="text"
                      placeholder="Ej: Ford / Scania"
                      value={vehBrand}
                      onChange={(e) => setVehBrand(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-0.5">Modelo</label>
                    <input
                      type="text"
                      placeholder="Ej: Ranger / R450"
                      value={vehModel}
                      onChange={(e) => setVehModel(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-0.5">Año</label>
                    <input
                      type="number"
                      placeholder="2020"
                      value={vehYear}
                      onChange={(e) => setVehYear(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-0.5">Patente</label>
                    <input
                      type="text"
                      placeholder="AD 123 XY"
                      value={vehPlate}
                      onChange={(e) => setVehPlate(e.target.value.toUpperCase())}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono uppercase"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Botones de acción */}
          <div className="border-t border-slate-200 pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>{customerToEdit ? 'Guardar Cambios' : 'Registrar Cliente'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
