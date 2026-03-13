// Role-based routing logic
import React from 'react';
import { OwnerDashboard } from '@/components/pages/owner/OwnerDashboard';
import { TenantDashboard } from '@/components/pages/tenant/TenantDashboard';
import { TreasurerDashboard } from '@/components/pages/treasurer/TreasurerDashboard';
import { PropertiesPage } from '@/components/pages/owner/PropertiesPage';
import { UnitsPage } from '@/components/pages/owner/UnitsPage';
import { LeadsPage } from '@/components/pages/owner/LeadsPage';
import { TenantsPage } from '@/components/pages/owner/TenantsPage';
import { TreasurersPage } from '@/components/pages/owner/TreasurersPage';
import { LeasesPage } from '@/components/pages/owner/LeasesPage';
import { OwnerInvoicesPage } from '@/components/pages/owner/OwnerInvoicesPage';
import { TenantInvoicesPage } from '@/components/pages/tenant/TenantInvoicesPage';
import { TenantPaymentsPage } from '@/components/pages/tenant/TenantPaymentsPage';
import { PaymentVerificationPage } from '@/components/pages/treasurer/PaymentVerificationPage';
import { MaintenanceExpensesPage } from '@/components/pages/treasurer/MaintenanceExpensesPage';
import { TenantMaintenancePage } from '@/components/pages/tenant/TenantMaintenancePage';
import { OwnerMaintenancePage } from '@/components/pages/owner/OwnerMaintenancePage';
import { AnalyticsPage } from '@/components/reports/AnalyticsPage';
import { SettingsPage } from '@/components/pages/common/SettingsPage';
import OwnerPayoutsPage from '@/components/pages/OwnerPayoutsPage';
import AuditLogsPage from '@/components/pages/AuditLogsPage';
import { VisitsPage } from '@/components/pages/owner/VisitsPage';
import { NotificationsPage } from '@/components/pages/common/NotificationsPage';

interface User {
  role: 'owner' | 'tenant' | 'treasurer';
}

export const renderPage = (activePage: string, user: User | null) => {
  // Dashboard pages
  if (activePage === 'dashboard') {
    if (user?.role === 'owner') {
      return <OwnerDashboard />;
    } else if (user?.role === 'tenant') {
      return <TenantDashboard />;
    } else if (user?.role === 'treasurer') {
      return <TreasurerDashboard />;
    }
  }

  // Common pages
  if (activePage === 'settings') {
    return <SettingsPage />;
  }

  if (activePage === 'notifications') {
    return <NotificationsPage />;
  }

  if (activePage === 'properties') {
    return <PropertiesPage />;
  }

  // Owner pages
  if (user?.role === 'owner') {
    if (activePage === 'units') return <UnitsPage />;
    if (activePage === 'leads') return <LeadsPage />;
    if (activePage === 'tenants') return <TenantsPage />;
    if (activePage === 'treasurers') return <TreasurersPage />;
    if (activePage === 'leases') return <LeasesPage />;
    if (activePage === 'invoices') return <OwnerInvoicesPage />;
    if (activePage === 'maintenance') return <OwnerMaintenancePage />;
    if (activePage === 'analytics') return <AnalyticsPage />;
    if (activePage === 'payouts') return <OwnerPayoutsPage />;
    if (activePage === 'audit') return <AuditLogsPage />;
    if (activePage === 'visits') return <VisitsPage />;
  }

  // Tenant pages
  if (user?.role === 'tenant') {
    if (activePage === 'invoices') return <TenantInvoicesPage />;
    if (activePage === 'maintenance') return <TenantMaintenancePage />;
    if (activePage === 'payments') {
      // Show payment history for tenants
      return <TenantPaymentsPage />;
    }
  }

  // Treasurer pages
  if (user?.role === 'treasurer') {
    if (activePage === 'payments') return <PaymentVerificationPage />;
    if (activePage === 'expenses') return <MaintenanceExpensesPage />;
    if (activePage === 'analytics') return <AnalyticsPage />;
  }

  // Placeholder for other pages
  return (
    <div className="text-center py-12">
      <h2 className="text-xl font-semibold text-gray-900">
        {activePage.charAt(0).toUpperCase() + activePage.slice(1)}
      </h2>
      <p className="text-gray-500 mt-2">This page is under construction</p>
    </div>
  );
};
