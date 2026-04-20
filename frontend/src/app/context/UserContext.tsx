// ============================================================================
//  USER CONTEXT (The Community Registry)
// ============================================================================
//  This context tracks the people in our system.
//  It manages the list of Tenants, Treasurers, and Owners,
//  handling the creation and removal of staff roles.
// ============================================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import apiClient from '../../services/api';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { toLKRFromCents } from '../../utils/formatters';
import { enqueueFetch } from '../../utils/fetchQueue';

export interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string;
  leaseId?: string;
  createdAt: string;
  status?: string;
  behaviorScore?: number;
  nic?: string;
  nicUrl?: string;
  tinUrl?: string;
  idCardUrl?: string;
  monthlyIncome?: number | string;
  employmentStatus?: string;
  permanentAddress?: string;
}

export interface Treasurer {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  createdAt: string;
  status: 'active' | 'inactive';
}

interface UserContextType {
  tenants: Tenant[];
  treasurers: Treasurer[];
  owners: any[]; // Using any for now to avoid complex type export issues
  addTenant: (tenant: Omit<Tenant, 'id' | 'createdAt'>) => void;
  addTreasurer: (
    treasurer: Omit<Treasurer, 'id' | 'createdAt'> & { id?: string }
  ) => void;
  updateTreasurer: (id: string, treasurer: Partial<Treasurer>) => void;
  deleteTreasurer: (id: string) => void;
  refetchUsers: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  // 1. [DEPENDENCIES] Context Injection: Accesses global identity for role-based scoping (Owner vs Staff)
  const { user } = useAuth();

  // 2. [STATE] Persona Registers: Holds reactive lists of stakeholders (Tenants, Treasurers, Owners)
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [treasurers, setTreasurers] = useState<Treasurer[]>([]);
  const [owners, setOwners] = useState<any[]>([]);

  // FETCH USERS: Retrieves stakeholder data based on requester's permissions.
  const fetchUsers = useCallback(async () => {
    if (!user) return;

    // 1. [SECURITY] Role Gate: Only the building owner can manage treasury staff
    if (user.role === 'owner') {
      try {
        const trRes = await apiClient.get('/users/treasurers');
        if (trRes.data) {
          setTreasurers(trRes.data);
        }
      } catch (e) {
        console.error('Failed to fetch treasurers', e);
      }
    }

    // 2. [SECURITY] Role Gate: Management roles can access tenant and partner owner lists
    if (user.role === 'owner' || user.role === 'treasurer') {
      try {
        // [TENANT FETCH] Retrieves all active renters with financial normalization
        const tRes = await apiClient.get('/users/tenants');
        if (tRes.data) {
          // 3. [TRANSFORMATION] Data Normalization: standardizes IDs and monthly income formats
          setTenants(
            tRes.data.map((t: any) => ({
              ...t,
              id: t.id ? t.id.toString() : t.user_id?.toString(),
              monthlyIncome: t.monthlyIncome
                ? toLKRFromCents(t.monthlyIncome)
                : undefined,
            }))
          );
        }
      } catch (e) {
        console.error('Failed to fetch tenants', e);
      }

      try {
        // [OWNER FETCH] Retrieves all property owners (Used by Treasurers for payout steering)
        const oRes = await apiClient.get('/users/owners');
        if (oRes.data) {
          setOwners(oRes.data);
        }
      } catch (e) {
        console.error('Failed to fetch owners', e);
      }
    }
  }, [user]);

  // INITIALIZATION EFFECT: Refresh persona data on identity change via global fetch queue.
  useEffect(() => {
    if (user) enqueueFetch(fetchUsers);
  }, [fetchUsers]);

  // ADD TENANT: Registers a new renter profile (Local state update).
  const addTenant = (tenant: Omit<Tenant, 'id' | 'createdAt'>) => {
    // 1. [SYNC] Local update for UI responsiveness
    const newTenant: Tenant = {
      ...tenant,
      id: `tenant-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setTenants((prev) => [...prev, newTenant]);
  };

  // ADD TREASURER: Onboards a new staff member (Local state update).
  const addTreasurer = (
    treasurer: Omit<Treasurer, 'id' | 'createdAt'> & { id?: string }
  ) => {
    // 1. [SYNC] Local update
    const newTreasurer: Treasurer = {
      ...treasurer,
      id: treasurer.id || `treasurer-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setTreasurers((prev) => [...prev, newTreasurer]);
  };

  // STAFF MANAGEMENT: Local CRUD operations for treasurer roles.
  const updateTreasurer = (id: string, updates: Partial<Treasurer>) => {
    setTreasurers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  };

  const deleteTreasurer = (id: string) => {
    setTreasurers((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <UserContext.Provider
      value={{
        tenants,
        treasurers,
        owners,
        addTenant,
        addTreasurer,
        updateTreasurer,
        deleteTreasurer,
        refetchUsers: fetchUsers,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined)
    throw new Error('useUser must be used within a UserProvider');
  return context;
}
