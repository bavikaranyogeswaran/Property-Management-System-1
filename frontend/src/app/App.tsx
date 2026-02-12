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
  useLocation,
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

// Tenant Pages
import { TenantDashboard } from '@/components/pages/tenant/TenantDashboard';
import { TenantInvoicesPage } from '@/components/pages/tenant/TenantInvoicesPage';
import { TenantMaintenancePage } from '@/components/pages/tenant/TenantMaintenancePage';
import { TenantPaymentsPage } from '@/components/pages/tenant/TenantPaymentsPage';

// Treasurer Pages
import { TreasurerDashboard } from '@/components/pages/treasurer/TreasurerDashboard';
import { PaymentVerificationPage } from '@/components/pages/treasurer/PaymentVerificationPage';
import { MaintenanceExpensesPage } from '@/components/pages/treasurer/MaintenanceExpensesPage';

// Shared Pages
import { AnalyticsPage } from '@/components/reports/AnalyticsPage';
import { SettingsPage } from '@/components/pages/common/SettingsPage';
import { ReceiptsPage } from '@/components/pages/common/ReceiptsPage';
import { PublicListingPage } from '@/components/pages/public/PublicListingPage';
import { PublicPropertyDetailsPage } from '@/components/pages/public/PublicPropertyDetailsPage';

// Lead Pages
import { LeadDashboard } from '@/components/pages/lead/LeadDashboard';

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
  if (user?.role === 'lead') return <LeadDashboard />;
  return <Navigate to="/login" />;
}

function AppContent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    // These logs help developers see what's happening in the browser console
    console.log('DEBUG: Current Path:', location.pathname);
    console.log('DEBUG: User Auth:', user);
  }, [location, user]);

  const handleNavigate = (page: string) => {
    navigate(page === 'login' ? '/login' : `/${page}`);
  };

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

      {/* ======================================================================= */}
      {/*  OWNER ROUTES (Landlord Area) */}
      {/*  Only users with 'owner' role can see these pages. */}
      {/* ======================================================================= */}
      {/* Owner Routes */}
      {user?.role === 'owner' && (
        <>
          {/* Properties already handled above, but maybe mapped as sub-route? No, it's fine. */}
          {/* Note: If user is owner, they hit the conditional above. */}

          <Route
            path="/units"
            element={
              <ProtectedRoute>
                <UnitsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/visits"
            element={
              <ProtectedRoute>
                <VisitsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leads"
            element={
              <ProtectedRoute>
                <LeadsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tenants"
            element={
              <ProtectedRoute>
                <TenantsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/treasurers"
            element={
              <ProtectedRoute>
                <TreasurersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leases"
            element={
              <ProtectedRoute>
                <LeasesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invoices"
            element={
              <ProtectedRoute>
                <OwnerInvoicesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/maintenance"
            element={
              <ProtectedRoute>
                <OwnerMaintenancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <OwnerReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <AnalyticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/receipts"
            element={
              <ProtectedRoute>
                <ReceiptsPage />
              </ProtectedRoute>
            }
          />
        </>
      )}

      {/* ======================================================================= */}
      {/*  TENANT ROUTES (Renter Area) */}
      {/*  Only users with 'tenant' role can see these pages. */}
      {/* ======================================================================= */}
      {/* Tenant Routes */}
      {user?.role === 'tenant' && (
        <>
          <Route
            path="/invoices"
            element={
              <ProtectedRoute>
                <TenantInvoicesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/maintenance"
            element={
              <ProtectedRoute>
                <TenantMaintenancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payments"
            element={
              <ProtectedRoute>
                <TenantPaymentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/receipts"
            element={
              <ProtectedRoute>
                <ReceiptsPage />
              </ProtectedRoute>
            }
          />
        </>
      )}

      {/* ======================================================================= */}
      {/*  TREASURER ROUTES (Accountant Area) */}
      {/*  Only users with 'treasurer' role can see these pages. */}
      {/* ======================================================================= */}
      {/* Treasurer Routes */}
      {user?.role === 'treasurer' && (
        <>
          <Route
            path="/invoices"
            element={
              <ProtectedRoute>
                <OwnerInvoicesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payments"
            element={
              <ProtectedRoute>
                <PaymentVerificationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute>
                <MaintenanceExpensesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <AnalyticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/receipts"
            element={
              <ProtectedRoute>
                <ReceiptsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tenants"
            element={
              <ProtectedRoute>
                <TenantsPage />
              </ProtectedRoute>
            }
          />
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
