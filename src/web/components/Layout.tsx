import React, { useState } from 'react';
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
} from 'lucide-react';
import { Logo } from './Logo';
import { useAuth } from '../context/AuthContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { formatDate } from '../../shared/time';

interface LayoutProps {
  alertCount?: number;
}

export const Layout: React.FC<LayoutProps> = ({ alertCount = 0 }) => {
  const { user, logout } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', label: 'Inicio', icon: LayoutDashboard },
    { to: '/pos', label: 'Punto de venta', icon: ShoppingCart },
    { to: '/products', label: 'Productos', icon: Package },
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
            <div className="flex items-center gap-4">
              <span>San Carlos de Bariloche, Río Negro</span>
              <span>·</span>
              <span>Hoy: {formatDate(new Date())}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span>{isOnline ? 'Conectado a la base central' : 'Modo local sin conexión'}</span>
            </div>
          </div>

          {/* Vistas / Páginas */}
          <main className="flex-1 p-4 md:p-6 bg-slate-100">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};
