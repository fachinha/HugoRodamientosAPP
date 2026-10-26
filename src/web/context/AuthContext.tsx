import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../api/client';
import type { Role } from '../../shared/schemas';

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(true);

  const checkStatusAndMe = async () => {
    try {
      setIsLoading(true);
      // 1. Estado de inicialización
      const statusRes = await apiFetch<{ initialized: boolean }>('/auth/status');
      setIsInitialized(statusRes.initialized);

      if (statusRes.initialized) {
        // 2. Sesión actual
        const meRes = await apiFetch<{ user: User | null }>('/auth/me');
        setUser(meRes.user);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkStatusAndMe();
  }, []);

  const login = async (username: string, password: string) => {
    const res = await apiFetch<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem('rh_token', res.token);
    setUser(res.user);
  };

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    } finally {
      localStorage.removeItem('rh_token');
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isInitialized,
        login,
        logout,
        refreshAuth: checkStatusAndMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe utilizarse dentro de AuthProvider');
  return ctx;
};
