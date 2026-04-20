// ============================================================================
//  APP CONTEXT (The Grand Orchestrator)
// ============================================================================
//  This file aggregates every single piece of logic (Properties, Leases, Payments)
//  into one massive "Super Hook" (useApp).
//  It ensures the entire frontend has easy access to all business logic.
// ============================================================================

import React, { ReactNode } from 'react';
import { PropertyProvider, useProperty } from './PropertyContext';
import { UserProvider, useUser } from './UserContext';
import { LeaseProvider, useLease } from './LeaseContext';
import { LeadProvider, useLead } from './LeadContext';
import { FinancialProvider, useFinancial } from './FinancialContext';
import { MaintenanceProvider, useMaintenance } from './MaintenanceContext';
import { NotificationProvider, useNotification } from './NotificationContext';

// Export types from domain contexts for convenience
export * from './PropertyContext';
export * from './UserContext';
export * from './LeaseContext';
export * from './LeadContext';
export * from './FinancialContext';
export * from './MaintenanceContext';
export * from './NotificationContext';

interface AppProviderProps {
  children: ReactNode;
}

/**
 * AppProvider aggregates all domain-specific contexts into a single unified tree.
 * The hierarchy is ordered to satisfy inter-context dependencies (e.g., Notification depends on Lease).
 */
export function AppProvider({ children }: AppProviderProps) {
  // 1. [COMPOSITION] Provider Nesting: Establishes the cascading reactive state for the entire application.
  // Order: Base Data (Property/User) -> Contractual Assets (Lease/Lead) -> Financials/Operations (Financial/Maintenance) -> System Events (Notification)
  return (
    <PropertyProvider>
      <UserProvider>
        <LeaseProvider>
          <LeadProvider>
            <FinancialProvider>
              <MaintenanceProvider>
                <NotificationProvider>{children}</NotificationProvider>
              </MaintenanceProvider>
            </FinancialProvider>
          </LeadProvider>
        </LeaseProvider>
      </UserProvider>
    </PropertyProvider>
  );
}

/**
 * useApp is a Façade hook that aggregates all domain-specific hooks into one interface.
 * Implemented for backward compatibility and to serve as a 'Super Hook' for complex views.
 */
export function useApp() {
  // 1. [INJECTION] Domain Hook Resolution
  const property = useProperty();
  const user = useUser();
  const lease = useLease();
  const lead = useLead();
  const financial = useFinancial();
  const maintenance = useMaintenance();
  const notification = useNotification();

  // 2. [COMBINATION] Flattened API: Merges all domain states and methods into a single accessible object.
  return {
    ...property,
    ...user,
    ...lease,
    ...lead,
    ...financial,
    ...maintenance,
    ...notification,
  };
}
