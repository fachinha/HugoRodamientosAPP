import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Disc, Lock, User as UserIcon, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login, isInitialized } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (err: any) {
      setError(err?.message || 'Usuario o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        {/* Identidad */}
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-sky-600 flex items-center justify-center text-white mx-auto shadow-md">
            <Disc className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Rodamientos Hugo</h2>
          <p className="text-xs text-slate-500">Sistema de Gestión de Inventario y Punto de Venta</p>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Usuario</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <UserIcon className="h-4 w-4" />
              </div>
              <input
                type="text"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nombre de usuario..."
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-4 w-4" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-sm font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>Iniciar sesión</span>
          </button>
        </form>

        {!isInitialized && (
          <div className="pt-2 text-center border-t border-slate-100">
            <Link to="/setup" className="text-xs font-semibold text-sky-600 hover:underline">
              ¿Es la primera vez? Configurar administrador inicial →
            </Link>
          </div>
        )}

        <div className="text-center text-[11px] text-slate-400">
          San Carlos de Bariloche · Río Negro
        </div>
      </div>
    </div>
  );
};
