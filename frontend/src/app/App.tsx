// ============================================================================
//  FRONTEND ENTRY POINT (The Main Map)
// ============================================================================
//  This file acts as the "Traffic Controller" for the website.
//  It checks "Who are you?" (Owner, Tenant, etc.) and "Where do you want to go?"
//  then shows the correct page.
// ============================================================================

import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppProviders } from './providers';
import { LandingPage } from '@/components/pages/LandingPage';
import { AppLayout } from '@/components/layout/AppLayout';

// Wrapper for Landing Page to handle navigation
function LandingPageWrapper() {
  const navigate = useNavigate();
  return (
    <LandingPage
      onNavigate={(page) => navigate(page === 'login' ? '/login' : `/${page}`)}
    />
  );
}

// Layout for Public Pages (Properties) - reuse AppLayout but maybe simpler?
// For now, if user is not logged in, AppLayout might break or show empty sidebar.
// Let's assume AppLayout handles 'no user' gracefully or we use a separate PublicLayout.
// Given time constraints, I'll use a simple container for public /properties.
// Or better: reused Nav from Landing Page?
// Let's create a PublicPropertiesWrapper that adds the Landing Page Nav.

function PublicPropertiesWrapper({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex justify-between items-center mb-6">
        <div
          onClick={() => navigate('/')}
          className="font-bold text-xl cursor-pointer flex items-center gap-2"
        >
          <span className="text-blue-600">PMS</span>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-gray-600 hover:text-blue-600"
          >
            Home
          </button>
          <button
            onClick={() => navigate('/login')}
            className="text-blue-600 font-medium"
          >
            Login
          </button>
        </div>
      </nav>
      <div className="container mx-auto px-6 pb-12">{children}</div>
    </div>
  );
}
import { Toaster } from '@/components/ui/sonner';

// Auth Pages
import { LoginPage } from '@/components/pages/auth/LoginPage';
import { ForgotPasswordPage } from '@/components/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/components/pages/auth/ResetPasswordPage';
import { VerifyEmailPage } from '@/components/pages/auth/VerifyEmailPage';
import { SetupPasswordPage } from '@/components/pages/auth/SetupPasswordPage';

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
import { VisitsPage } from '@/components/pages/owner/VisitsPage';
import OwnerPayoutsPage from '@/components/pages/OwnerPayoutsPage';
import TreasurerPayoutsPage from '@/components/pages/treasurer/TreasurerPayoutsPage';
import { OwnerPaymentsPage } from '@/components/pages/owner/OwnerPaymentsPage';
import { RefundRequestsPage } from '@/components/pages/owner/RefundRequestsPage';

// Tenant Pages
import { TenantDashboard } from '@/components/pages/tenant/TenantDashboard';
import { TenantInvoicesPage } from '@/components/pages/tenant/TenantInvoicesPage';
import { TenantMaintenancePage } from '@/components/pages/tenant/TenantMaintenancePage';
import { TenantPaymentsPage } from '@/components/pages/tenant/TenantPaymentsPage';
import { TenantLeasePage } from '@/components/pages/tenant/TenantLeasePage';
import { TenantPaymentSummaryPage } from '@/components/pages/tenant/TenantPaymentSummaryPage';

// Treasurer Pages
import { TreasurerDashboard } from '@/components/pages/treasurer/TreasurerDashboard';
import { PaymentVerificationPage } from '@/components/pages/treasurer/PaymentVerificationPage';
import { MaintenanceExpensesPage } from '@/components/pages/treasurer/MaintenanceExpensesPage';

// Shared Pages
import { AnalyticsPage } from '@/components/reports/AnalyticsPage';
import { SettingsPage } from '@/components/pages/common/SettingsPage';
import { ReceiptsPage } from '@/components/pages/common/ReceiptsPage';
import { NotificationsPage } from '@/components/pages/common/NotificationsPage';
import { PublicListingPage } from '@/components/pages/public/PublicListingPage';
import { PublicPropertyDetailsPage } from '@/components/pages/public/PublicPropertyDetailsPage';
import CancelVisitPage from '@/components/pages/public/CancelVisitPage';
import PaymentSuccessPage from '@/components/pages/public/PaymentSuccessPage';
import AuditLogsPage from '@/components/pages/AuditLogsPage';
import { GuestPaymentPage } from '@/components/pages/public/GuestPaymentPage';
import { OnboardingStatusPage } from '@/components/pages/public/OnboardingStatusPage';
import PayHereSimulationPage from '@/components/pages/public/PayHereSimulationPage';

// Lead Pages

import { LeadPortalPage } from '@/components/pages/lead/LeadPortalPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function RoleRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: string[];
}) {
  const { user } = useAuth();
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function DashboardRoute() {
  const { user } = useAuth();
  if (user?.role === 'owner') return <OwnerDashboard />;
  if (user?.role === 'tenant') return <TenantDashboard />;
  if (user?.role === 'treasurer') return <TreasurerDashboard />;
  if (user?.role === 'lead') return <Navigate to="/" />;
  return <Navigate to="/login" />;
}

function AppContent() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleNavigate = (page: string) => {
    navigate(page === 'login' ? '/login' : `/${page}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Routes>
      {/* ======================================================================= */}
      {/*  PUBLIC ROUTES (Open to Everyone) */}
      {/*  Pages that anyone can see without logging in (Landing Page, Login). */}
      {/* ======================================================================= */}
      {/* Public Routes */}
      <Route path="/" element={<LandingPageWrapper />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/setup-password" element={<SetupPasswordPage />} />
      <Route path="/cancel-visit" element={<CancelVisitPage />} />
      <Route path="/payment-success" element={<PaymentSuccessPage />} />
      <Route
        path="/pay/:token"
        element={
          <PublicPropertiesWrapper>
            <GuestPaymentPage />
          </PublicPropertiesWrapper>
        }
      />
      <Route
        path="/onboarding/:token"
        element={
          <PublicPropertiesWrapper>
            <OnboardingStatusPage />
          </PublicPropertiesWrapper>
        }
      />
      <Route path="/payhere-simulation" element={<PayHereSimulationPage />} />

      {/* Public/Shared Properties Route */}
      <Route
        path="/browse-properties"
        element={
          <PublicPropertiesWrapper>
            <PublicListingPage onNavigate={(page) => handleNavigate(page)} />
          </PublicPropertiesWrapper>
        }
      />
      <Route
        path="/property/:id"
        element={
          <PublicPropertiesWrapper>
            <PublicPropertyDetailsPage />
          </PublicPropertiesWrapper>
        }
      />
      <Route
        path="/lead/portal"
        element={
          <PublicPropertiesWrapper>
            <LeadPortalPage />
          </PublicPropertiesWrapper>
        }
      />
      <Route
        path="/properties"
        element={
          user ? (
            <ProtectedRoute>
              <PropertiesPage />
            </ProtectedRoute>
          ) : (
            <Navigate to="/browse-properties" replace />
          )
        }
      />

      {/* ======================================================================= */}
      {/*  This determines if we show the main Dashboard or redirect to login */}
      {/* ======================================================================= */}

      {/* Protected Routes */}
      {/* Dashboard */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        }
      />

      {/* ======================================================================= */}
      {/*  OWNER ROUTES (Landlord Area) */}
      {/*  Only users with 'owner' role can see these pages. */}
      {/* ======================================================================= */}
      {/* Owner Routes */}
      {/* Owner Routes */}
      <Route
        path="/units"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner']}>
              <UnitsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/visits"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner']}>
              <VisitsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner']}>
              <LeadsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tenants"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner']}>
              <TenantsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/treasurers"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner']}>
              <TreasurersPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leases"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner']}>
              <LeasesPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/refund-requests"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner']}>
              <RefundRequestsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/invoices"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner', 'tenant', 'treasurer']}>
              <OwnerInvoicesPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/maintenance"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner', 'tenant', 'treasurer']}>
              <OwnerMaintenancePage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner']}>
              <OwnerReportsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner', 'treasurer']}>
              <AnalyticsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payouts"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner', 'treasurer']}>
              <OwnerPayoutsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner', 'tenant', 'treasurer']}>
              <OwnerPaymentsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit-logs"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['owner']}>
              <AuditLogsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      {/* ======================================================================= */}
      {/*  TENANT ROUTES (Renter Area) */}
      {/*  Only users with 'tenant' role can see these pages. */}
      {/* ======================================================================= */}
      {/* Tenant Routes */}
      {/* Tenant Routes */}
      <Route
        path="/invoices"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['tenant']}>
              <TenantInvoicesPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/maintenance"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['tenant']}>
              <TenantMaintenancePage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['tenant']}>
              <TenantPaymentsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/receipts"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['tenant']}>
              <ReceiptsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-lease"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['tenant']}>
              <TenantLeasePage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payment-summary"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['tenant']}>
              <TenantPaymentSummaryPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      {/* ======================================================================= */}
      {/*  TREASURER ROUTES (Accountant Area) */}
      {/*  Only users with 'treasurer' role can see these pages. */}
      {/* ======================================================================= */}
      {/* Treasurer Routes */}
      {/* Treasurer Routes */}
      <Route
        path="/invoices"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['treasurer']}>
              <OwnerInvoicesPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['treasurer']}>
              <PaymentVerificationPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leases"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['treasurer']}>
              <LeasesPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['treasurer']}>
              <MaintenanceExpensesPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/maintenance"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['treasurer']}>
              <OwnerMaintenancePage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['treasurer']}>
              <AnalyticsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/receipts"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['treasurer']}>
              <ReceiptsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tenants"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['treasurer']}>
              <TenantsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payouts"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['treasurer']}>
              <TreasurerPayoutsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

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
