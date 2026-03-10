import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppProviders } from './providers';
import { AppLayout } from '@/components/layout/AppLayout';
import { Toaster } from '@/components/ui/sonner';

// Auth Pages
import { LoginPage } from '@/components/pages/auth/LoginPage';
import { RegisterPage } from '@/components/pages/auth/RegisterPage';
import { ForgotPasswordPage } from '@/components/pages/auth/ForgotPasswordPage';

// Owner Pages
import { OwnerDashboard } from '@/components/pages/owner/OwnerDashboard';
import { PropertiesPage } from '@/components/pages/owner/PropertiesPage';
import { UnitsPage } from '@/components/pages/owner/UnitsPage';
import { LeadsPage } from '@/components/pages/owner/LeadsPage';
import { TenantsPage } from '@/components/pages/owner/TenantsPage';
import { TreasurersPage } from '@/components/pages/owner/TreasurersPage';
import { LeasesPage } from '@/components/pages/owner/LeasesPage';
import { OwnerInvoicesPage } from '@/components/pages/owner/OwnerInvoicesPage';
import { OwnerMaintenancePage } from '@/components/pages/owner/OwnerMaintenancePage';
import { OwnerReportsPage } from '@/components/pages/owner/OwnerReportsPage';

// Tenant Pages
import { TenantDashboard } from '@/components/pages/tenant/TenantDashboard';
import { TenantInvoicesPage } from '@/components/pages/tenant/TenantInvoicesPage';
import { TenantMaintenancePage } from '@/components/pages/tenant/TenantMaintenancePage';
import { TenantPaymentsPage } from '@/app/components/pages/TenantPaymentsPage';

// Treasurer Pages
import { TreasurerDashboard } from '@/components/pages/treasurer/TreasurerDashboard';
import { PaymentVerificationPage } from '@/components/pages/treasurer/PaymentVerificationPage';

// Shared Pages
import { AnalyticsPage } from '@/components/reports/AnalyticsPage';
import { SettingsPage } from '@/components/pages/common/SettingsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function DashboardRoute() {
  const { user } = useAuth();
  if (user?.role === 'owner') return <OwnerDashboard />;
  if (user?.role === 'tenant') return <TenantDashboard />;
  if (user?.role === 'treasurer') return <TreasurerDashboard />;
  return <Navigate to="/login" />;
}

function AppContent() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Protected Routes */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardRoute /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

      {/* Owner Routes */}
      {user?.role === 'owner' && (
        <>
          <Route path="/properties" element={<ProtectedRoute><PropertiesPage /></ProtectedRoute>} />
          <Route path="/units" element={<ProtectedRoute><UnitsPage /></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute><LeadsPage /></ProtectedRoute>} />
          <Route path="/tenants" element={<ProtectedRoute><TenantsPage /></ProtectedRoute>} />
          <Route path="/treasurers" element={<ProtectedRoute><TreasurersPage /></ProtectedRoute>} />
          <Route path="/leases" element={<ProtectedRoute><LeasesPage /></ProtectedRoute>} />
          <Route path="/invoices" element={<ProtectedRoute><OwnerInvoicesPage /></ProtectedRoute>} />
          <Route path="/maintenance" element={<ProtectedRoute><OwnerMaintenancePage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><OwnerReportsPage /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
        </>
      )}

      {/* Tenant Routes */}
      {user?.role === 'tenant' && (
        <>
          <Route path="/invoices" element={<ProtectedRoute><TenantInvoicesPage /></ProtectedRoute>} />
          <Route path="/maintenance" element={<ProtectedRoute><TenantMaintenancePage /></ProtectedRoute>} />
          <Route path="/payments" element={<ProtectedRoute><TenantPaymentsPage /></ProtectedRoute>} />
        </>
      )}

      {/* Treasurer Routes */}
      {user?.role === 'treasurer' && (
        <>
          <Route path="/payments" element={<ProtectedRoute><PaymentVerificationPage /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
        </>
      )}

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AppContent />
        <Toaster />
      </BrowserRouter>
    </AppProviders>
  );
}