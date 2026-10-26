import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Disc, Key, User as UserIcon, Lock, Check, AlertCircle, Loader2 } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';

export const SetupPage: React.FC = () => {
  const { refreshAuth } = useAuth();
  const navigate = useNavigate();

  const [token, setToken] = useState('');
  const [username, setUsername] = useState('admin');
  const [displayName, setDisplayName] = useState('Administrador');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 10) {
      setError('La contraseña debe tener al menos 10 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/auth/setup', {
        method: 'POST',
        body: JSON.stringify({
          token: token.trim(),
          username: username.trim(),
          displayName: displayName.trim(),
          password,
        }),
      });

      await refreshAuth();
      navigate('/login');
    } catch (err: any) {
      setError(err?.message || 'Error al inicializar el administrador.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-sky-600 flex items-center justify-center text-white mx-auto shadow-md">
            <Disc className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Configuración Inicial</h2>
          <p className="text-xs text-slate-500">
            Creá la cuenta del primer Administrador para Rodamientos Hugo.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSetup} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Token de instalación del servidor (SETUP_TOKEN) *
            </label>
            <div className="relative">
              <Key className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Token configurado en .dev.vars / Cloudflare..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs"
              />
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Definido en el archivo <code>.dev.vars</code> (local) o mediante <code>wrangler secret</code> (remoto).
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Usuario administrador *</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre y apellido *</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ej: Hugo Administrador"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contraseña (mín. 10) *</label>
              <input
                type="password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Repetir contraseña *</label>
              <input
                type="password"
                required
                minLength={10}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            <span>Crear administrador inicial</span>
          </button>
        </form>
      </div>
    </div>
  );
};
