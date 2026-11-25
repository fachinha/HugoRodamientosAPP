import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Layers,
  AlertTriangle,
  History,
  Settings,
  LogOut,
  Menu,
  X,
  WifiOff,
  User as UserIcon,
  FileText,
  TrendingUp,
  BookOpen,
  DollarSign,
  Check,
  Edit2,
  RefreshCw,
  Wallet,
  Users,
  Truck,
  Landmark,
} from 'lucide-react';
import { Logo } from './Logo';
import { CopilotDrawer } from './CopilotDrawer';
import { useAuth } from '../context/AuthContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { formatDate } from '../../shared/time';
import { apiFetch } from '../api/client';

interface LayoutProps {
  alertCount?: number;
}

export const Layout: React.FC<LayoutProps> = ({ alertCount = 0 }) => {
  const { user, logout } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exchangeRateUsd, setExchangeRateUsd] = useState<number>(1575);
  const [buyRateUsd, setBuyRateUsd] = useState<number>(1555);
  const [rateMode, setRateMode] = useState<'auto' | 'manual'>('auto');
  const [syncingRate, setSyncingRate] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [tempRate, setTempRate] = useState('1575');
  const navigate = useNavigate();

  const loadExchangeRate = async (forceRefresh = false) => {
    try {
      if (forceRefresh) setSyncingRate(true);
      const res = await apiFetch<{
        rate: number;
        buyRate?: number;
        sellRate?: number;
        mode?: 'auto' | 'manual';
      }>(`/settings/exchange-rate${forceRefresh ? '?refresh=1' : ''}`);
      if (res?.rate) {
        setExchangeRateUsd(res.rate);
        setBuyRateUsd(res.buyRate || res.rate);
        setRateMode(res.mode || 'auto');
        setTempRate(String(res.rate));
        if (forceRefresh) {
          window.dispatchEvent(new CustomEvent('rh_exchange_rate_updated', { detail: { rate: res.rate, buyRate: res.buyRate, mode: res.mode } }));
        }
      }
    } catch {
      // Ignorar si no hay conexión
    } finally {
      if (forceRefresh) setSyncingRate(false);
    }
  };

  useEffect(() => {
    loadExchangeRate(false);

    // Auto-actualización cada 5 minutos por si sube o baja el Dólar Blue en el día
    const interval = setInterval(() => {
      loadExchangeRate(true);
    }, 5 * 60 * 1000);

    const handleRateSync = (e: Event) => {
      const custom = e as CustomEvent<{ rate: number; buyRate?: number; mode?: 'auto' | 'manual' }>;
      if (custom.detail?.rate) {
        setExchangeRateUsd(custom.detail.rate);
        if (custom.detail.buyRate) setBuyRateUsd(custom.detail.buyRate);
        if (custom.detail.mode) setRateMode(custom.detail.mode);
        setTempRate(String(custom.detail.rate));
      }
    };
    window.addEventListener('rh_exchange_rate_updated', handleRateSync);
    return () => {
      clearInterval(interval);
      window.removeEventListener('rh_exchange_rate_updated', handleRateSync);
    };
  }, []);

  const handleSaveTopBarRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateNum = parseFloat(tempRate);
    if (isNaN(rateNum) || rateNum <= 0) return;
    try {
      const res = await apiFetch<{ rate: number; buyRate?: number; mode?: 'auto' | 'manual' }>('/settings/exchange-rate', {
        method: 'POST',
        body: JSON.stringify({ rate: rateNum, mode: 'manual' }),
      });
      setExchangeRateUsd(res.rate || rateNum);
      setRateMode('manual');
      setEditingRate(false);
      window.dispatchEvent(new CustomEvent('rh_exchange_rate_updated', { detail: { rate: res.rate || rateNum, mode: 'manual' } }));
    } catch {
      setEditingRate(false);
    }
  };

  const handleRestoreAutoBlue = async () => {
    try {
      setSyncingRate(true);
      const res = await apiFetch<{ rate: number; buyRate?: number; mode?: 'auto' | 'manual' }>('/settings/exchange-rate', {
        method: 'POST',
        body: JSON.stringify({ mode: 'auto' }),
      });
      if (res?.rate) {
        setExchangeRateUsd(res.rate);
        if (res.buyRate) setBuyRateUsd(res.buyRate);
        setRateMode('auto');
        setTempRate(String(res.rate));
        setEditingRate(false);
        window.dispatchEvent(new CustomEvent('rh_exchange_rate_updated', { detail: { rate: res.rate, buyRate: res.buyRate, mode: 'auto' } }));
      }
    } catch {
      // Error
    } finally {
      setSyncingRate(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', label: 'Inicio', icon: LayoutDashboard },
    { to: '/pos', label: 'Punto de venta', icon: ShoppingCart },
    { to: '/current-accounts', label: 'Clientes', icon: Users },
    { to: '/quotes', label: 'Presupuestos', icon: FileText },
    { to: '/finance', label: 'Cash Flow, Payway y Padrón', icon: Landmark },
    { to: '/crm', label: 'Rentabilidad y Métricas', icon: TrendingUp },
    { to: '/products', label: 'Productos', icon: Package },
    { to: '/replenishment', label: 'Pedidos a Proveedores', icon: Truck },
    { to: '/catalogs', label: 'Catálogos Técnicos', icon: BookOpen },
    { to: '/inventory', label: 'Inventario', icon: Layers },
    {
      to: '/alerts',
      label: 'Alertas de stock',
      icon: AlertTriangle,
      badge: alertCount > 0 ? alertCount : undefined,
    },
    { to: '/movements', label: 'Movimientos', icon: History },
    { to: '/settings', label: 'Configuración', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Banner de pérdida de conexión */}
      {!isOnline && (
        <div className="bg-amber-600 text-white px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 shadow-sm no-print sticky top-0 z-50">
          <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
          <span>
            Sin conexión a internet. La confirmación de ventas y ajustes queda pausada para garantizar la consistencia del stock central.
          </span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Barra lateral escritorio */}
        <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-200 border-r border-slate-800 no-print">
          {/* Identidad visual oficial Hugo Repuestos (@hugo_repuestos) */}
          <div className="p-4 border-b border-slate-800 flex flex-col gap-2 bg-slate-950/60">
            <div className="flex items-center gap-3">
              <Logo variant="mark" />
              <div className="min-w-0 flex-1">
                <Logo variant="compact" theme="dark" className="h-7 w-auto" />
                <p className="text-[10px] text-zinc-400 tracking-wider uppercase font-medium">Bariloche · Repuestos</p>
              </div>
            </div>
          </div>

          {/* Menú de navegación */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-orange-600 text-white shadow-xs font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Perfil de usuario y Logout */}
          <div className="p-3 border-t border-slate-800 bg-slate-950/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 shrink-0">
                  <UserIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{user?.displayName}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                    {user?.role === 'admin' ? 'Administrador' : 'Vendedor'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Cerrar sesión"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Contenido principal */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Header móvil / barra superior */}
          <header className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between md:hidden no-print">
            <div className="flex items-center gap-2.5">
              <Logo variant="mark" />
              <Logo variant="compact" theme="dark" className="h-6 w-auto" />
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-300 hover:bg-slate-800 rounded-md"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </header>

          {/* Menú móvil desplegable */}
          {mobileMenuOpen && (
            <div className="md:hidden bg-slate-900 text-slate-200 border-b border-slate-800 px-4 py-3 space-y-1 no-print">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium ${
                      isActive ? 'bg-orange-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800'
                    }`
                  }
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">{user?.displayName} ({user?.role})</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-xs text-rose-400 font-medium hover:underline"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}

          {/* Barra superior de escritorio */}
          <div className="hidden md:flex bg-white border-b border-slate-200 px-6 py-2.5 items-center justify-between text-xs text-slate-500 no-print">
            <div className="flex items-center gap-3">
              <span>San Carlos de Bariloche, Río Negro</span>
              <span>·</span>
              <span>Hoy: {formatDate(new Date())}</span>
              <span>·</span>
              {editingRate ? (
                <form onSubmit={handleSaveTopBarRate} className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2 py-0.5">
                  <DollarSign className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-[11px] font-semibold text-blue-900">Manual 1 USD = $</span>
                  <input
                    type="number"
                    step="any"
                    value={tempRate}
                    onChange={(e) => setTempRate(e.target.value)}
                    autoFocus
                    className="w-20 px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    className="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer active:scale-95 transition-all"
                    title="Fijar cotización manual"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  {rateMode === 'manual' && (
                    <button
                      type="button"
                      onClick={handleRestoreAutoBlue}
                      className="px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded cursor-pointer active:scale-95 transition-all"
                      title="Volver a sincronizar automáticamente con Dólar Blue en vivo"
                    >
                      Auto Blue
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRate(false);
                      setTempRate(String(exchangeRateUsd));
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Cancelar"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </form>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50/90 border border-emerald-200 text-emerald-950 font-medium">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                  <span>
                    Dólar Blue: <strong className="font-mono font-bold text-emerald-900">${exchangeRateUsd.toLocaleString('es-AR')} ARS</strong>
                    {buyRateUsd > 0 && rateMode === 'auto' && (
                      <span className="text-[11px] text-emerald-700 ml-1">
                        (Compra: ${buyRateUsd.toLocaleString('es-AR')})
                      </span>
                    )}
                  </span>
                  <span
                    className={`ml-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wide ${
                      rateMode === 'auto'
                        ? 'bg-emerald-200/80 text-emerald-900'
                        : 'bg-amber-200/80 text-amber-900'
                    }`}
                    title={
                      rateMode === 'auto'
                        ? 'Se actualiza automáticamente cada 5 min cuando sube o baja el Dólar Blue'
                        : 'Valor fijado manualmente'
                    }
                  >
                    {rateMode === 'auto' ? 'En vivo' : 'Manual'}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadExchangeRate(true)}
                    disabled={syncingRate}
                    className="p-0.5 text-emerald-700 hover:text-emerald-950 hover:bg-emerald-100 rounded transition-colors cursor-pointer active:scale-95"
                    title="Actualizar cotización del Dólar Blue ahora"
                  >
                    <RefreshCw className={`h-3 w-3 ${syncingRate ? 'animate-spin' : ''}`} />
                  </button>
                  {user?.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => setEditingRate(true)}
                      className="p-0.5 text-emerald-700 hover:text-emerald-950 hover:bg-emerald-100 rounded transition-colors cursor-pointer active:scale-95"
                      title="Modificar cotización manualmente o cambiar modo"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span>{isOnline ? 'Conectado a la base central' : 'Modo local sin conexión'}</span>
            </div>
          </div>

          {/* Vistas / Páginas (pb-24 deja espacio libre inferior para que el botón flotante Copiloto IA nunca tape paginadores ni acciones) */}
          <main className="flex-1 p-4 pb-24 md:p-6 md:pb-24 bg-slate-100">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Copiloto de Mostrador con IA */}
      <CopilotDrawer />
    </div>
  );
};
