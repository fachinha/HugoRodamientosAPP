import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Package,
  AlertOctagon,
  AlertTriangle,
  ShoppingCart,
  DollarSign,
  ArrowRight,
  TrendingDown,
  Clock,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { formatARS } from '../../shared/money';
import { formatDateTime } from '../../shared/time';
import type { DashboardData } from '../../worker/services/dashboard.service';

export const DashboardPage: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch<DashboardData>('/dashboard');
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar los indicadores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <RefreshCw className="h-4 w-4 animate-spin text-sky-600" />
          <span>Cargando panel de control...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-center justify-between">
        <span>{error}</span>
        <button
          type="button"
          onClick={loadData}
          className="px-3 py-1 bg-rose-600 text-white rounded text-xs hover:bg-rose-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Encabezado y acciones rápidas */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Panel de Control</h2>
          <p className="text-xs text-slate-500">
            Resumen operativo y alertas prioritarias de stock para Rodamientos Hugo.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            to="/pos"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <ShoppingCart className="h-4 w-4" />
            <span>Punto de venta</span>
          </Link>
          <Link
            to="/inventory"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <PlusCircle className="h-4 w-4 text-emerald-600" />
            <span>Entrada de stock</span>
          </Link>
        </div>
      </div>

      {/* Tarjetas de Métricas Clave */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Productos */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Productos en catálogo</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{data?.productsCount ?? 0}</h3>
            <Link to="/products" className="text-xs text-sky-600 hover:underline mt-1 inline-flex items-center gap-1">
              <span>Ver catálogo</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
            <Package className="h-6 w-6" />
          </div>
        </div>

        {/* Productos Agotados */}
        <div className="bg-white rounded-xl p-5 border border-rose-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-rose-600 uppercase tracking-wider">Productos agotados</p>
            <h3 className="text-2xl font-bold text-rose-700 mt-1">{data?.outOfStockCount ?? 0}</h3>
            <Link to="/alerts?status=out" className="text-xs text-rose-600 hover:underline mt-1 inline-flex items-center gap-1 font-medium">
              <span>Reposición urgente</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="h-12 w-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
            <AlertOctagon className="h-6 w-6" />
          </div>
        </div>

        {/* Stock Bajo */}
        <div className="bg-white rounded-xl p-5 border border-amber-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-amber-700 uppercase tracking-wider">Con stock bajo</p>
            <h3 className="text-2xl font-bold text-amber-800 mt-1">{data?.lowStockCount ?? 0}</h3>
            <Link to="/alerts?status=low" className="text-xs text-amber-700 hover:underline mt-1 inline-flex items-center gap-1 font-medium">
              <span>Ver por debajo del mínimo</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>

        {/* Ventas Hoy */}
        <div className="bg-white rounded-xl p-5 border border-emerald-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Ventas de hoy ({data?.todayDayLabel})</p>
            <h3 className="text-2xl font-bold text-emerald-800 mt-1">{formatARS(data?.todaySalesTotalCents ?? 0)}</h3>
            <p className="text-xs text-slate-500 mt-1">
              <span className="font-semibold text-slate-700">{data?.todaySalesCount ?? 0}</span> operación(es)
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <DollarSign className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Alerta Destacada si hay faltantes */}
      {(data?.urgentReplenishmentCount ?? 0) > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-amber-900">
                Atención: Hay {data?.urgentReplenishmentCount} producto(s) en situación crítica de stock
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                {data?.outOfStockCount} agotado(s) y {data?.lowStockCount} por debajo del stock mínimo configurado.
                Reponerlos a tiempo evita pérdidas de ventas en el mostrador.
              </p>
            </div>
          </div>
          <Link
            to="/alerts"
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-md shadow-xs shrink-0 self-start sm:self-auto"
          >
            Ver sugerencias de compra
          </Link>
        </div>
      )}

      {/* Últimos Movimientos */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900">Últimos movimientos de stock registrados</h3>
          </div>
          <Link to="/movements" className="text-xs text-sky-600 hover:underline font-medium">
            Ver historial completo
          </Link>
        </div>

        {(!data?.recentMovements || data.recentMovements.length === 0) ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            Aún no hay movimientos de stock registrados en el sistema.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Fecha y Hora</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Operación</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3 text-right">Stock resultante</th>
                  <th className="px-4 py-3">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentMovements.map((mov) => {
                  const isPositive = mov.quantity > 0;
                  return (
                    <tr key={mov.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                        {formatDateTime(mov.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {mov.productSku}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800 max-w-xs truncate">
                        {mov.productName}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-800">
                          {mov.typeLabel}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-bold whitespace-nowrap ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPositive ? `+${mov.quantity}` : mov.quantity}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {mov.stockAfter}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                        {mov.userDisplayName}
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
  );
};
