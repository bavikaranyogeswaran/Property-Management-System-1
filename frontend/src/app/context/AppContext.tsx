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
 * AppProvider aggregates all domain-specific contexts.
 * The order of providers matters if there are dependencies between them.
 */
export function AppProvider({ children }: AppProviderProps) {
  return (
    <PropertyProvider>
      <UserProvider>
        <LeaseProvider>
          <LeadProvider>
            <FinancialProvider>
              <MaintenanceProvider>
                <NotificationProvider>
                  {children}
                </NotificationProvider>
              </MaintenanceProvider>
            </FinancialProvider>
          </LeadProvider>
        </LeaseProvider>
      </UserProvider>
    </PropertyProvider>
  );
}

/**
 * useApp is a backward-compatibility hook that aggregates all domain-specific hooks.
 * This allows existing components to continue working without changes.
 */
export function useApp() {
  const property = useProperty();
  const user = useUser();
  const lease = useLease();
  const lead = useLead();
  const financial = useFinancial();
  const maintenance = useMaintenance();
  const notification = useNotification();

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
