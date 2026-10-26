import React, { useState, useEffect } from 'react';
import {
  History,
  Download,
  Filter,
  Calendar,
  Search,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { formatDateTime } from '../../shared/time';
import type { MovementListItem } from '../../worker/services/stock.service';
import { useAuth } from '../context/AuthContext';

export const MovementsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [movements, setMovements] = useState<MovementListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const fetchMovements = async (p = page) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(p),
        pageSize: '50',
      });
      if (typeFilter) q.set('type', typeFilter);
      if (fromDate) q.set('from', fromDate);
      if (toDate) q.set('to', toDate);

      const res = await apiFetch<any>(`/movements?${q.toString()}`);
      setMovements(res.items);
      setTotal(res.total);
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch {
      setMovements([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovements(1);
  }, [typeFilter, fromDate, toDate]);

  const handleExportCsv = async () => {
    try {
      const csv = await apiFetch<string>('/exports/movements.csv');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `movimientos-stock-${new Date().toISOString().substring(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Error al exportar movimientos.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Historial de Movimientos de Stock</h2>
          <p className="text-xs text-slate-500">
            Registro de auditoría inmutable de todas las entradas, salidas, ventas y ajustes ({total} registros).
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Download className="h-4 w-4 text-sky-600" />
            <span>Exportar CSV</span>
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Tipo de movimiento</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
          >
            <option value="">Todos los tipos</option>
            <option value="purchase">Entrada de mercadería</option>
            <option value="sale">Venta (POS)</option>
            <option value="return">Devolución</option>
            <option value="adjust_in">Ajuste positivo (+)</option>
            <option value="adjust_out">Ajuste negativo (−)</option>
            <option value="reversal">Anulación de venta</option>
            <option value="initial">Stock inicial</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Desde</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Hasta</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
          />
        </div>

        {(typeFilter || fromDate || toDate) && (
          <div className="self-end pb-0.5">
            <button
              type="button"
              onClick={() => {
                setTypeFilter('');
                setFromDate('');
                setToDate('');
              }}
              className="text-xs text-rose-600 hover:underline font-medium"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Tabla de Movimientos */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
            <span>Cargando movimientos...</span>
          </div>
        ) : movements.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No se encontraron movimientos registrados con los filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Fecha y Hora</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Tipo de operación</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3 text-right">Stock antes</th>
                  <th className="px-4 py-3 text-right">Stock después</th>
                  <th className="px-4 py-3">Motivo / Documento</th>
                  <th className="px-4 py-3">Usuario responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((m) => {
                  const isPos = m.quantity > 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                        {formatDateTime(m.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {m.productSku}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800 max-w-xs truncate">
                        {m.productName}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {m.typeLabel}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-bold whitespace-nowrap ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPos ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">
                        {m.stockBefore}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                        {m.stockAfter}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">
                        {m.reason || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                        {m.userDisplayName}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => fetchMovements(page - 1)}
                className="px-3 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => fetchMovements(page + 1)}
                className="px-3 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
