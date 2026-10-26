import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/PosPage';
import { ProductsPage } from './pages/ProductsPage';
import { InventoryPage } from './pages/InventoryPage';
import { AlertsPage } from './pages/AlertsPage';
import { MovementsPage } from './pages/MovementsPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';
import { apiFetch } from './api/client';
import { Loader2 } from 'lucide-react';

const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, isLoading, isInitialized } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white gap-2 text-xs">
        <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
        <span>Iniciando Rodamientos Hugo...</span>
      </div>
    );
  }

  if (!isInitialized) {
    return <Navigate to="/setup" replace />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export const AppContent: React.FC = () => {
  const { user } = useAuth();
  const [alertCount, setAlertCount] = useState<number>(0);

  useEffect(() => {
    if (user) {
      apiFetch<any>('/alerts/summary')
        .then((s) => setAlertCount(s.totalRequiringAttention || 0))
        .catch(() => setAlertCount(0));
    }
  }, [user]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout alertCount={alertCount} />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="movements" element={<MovementsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
};
