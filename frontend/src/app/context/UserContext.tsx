import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient from '../../services/api';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { toLKRFromCents } from '../../utils/formatters';

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
  addTreasurer: (treasurer: Omit<Treasurer, 'id' | 'createdAt'> & { id?: string }) => void;
  updateTreasurer: (id: string, treasurer: Partial<Treasurer>) => void;
  deleteTreasurer: (id: string) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [treasurers, setTreasurers] = useState<Treasurer[]>([]);
  const [owners, setOwners] = useState<any[]>([]);

  const fetchUsers = async () => {
    if (!user) return;

    // Fetch Treasurers (Only for Owner)
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

    // Fetch Tenants (Owner and Treasurer)
    if (user.role === 'owner' || user.role === 'treasurer') {
      try {
        const tRes = await apiClient.get('/users/tenants');
        if (tRes.data) {
          setTenants(tRes.data.map((t: any) => ({
            ...t,
            monthlyIncome: t.monthlyIncome ? toLKRFromCents(t.monthlyIncome) : undefined
          })));
        }
      } catch (e) {
        console.error('Failed to fetch tenants', e);
      }

      // [NEW] Fetch Owners for Treasurers (to select for payout)
      try {
        const oRes = await apiClient.get('/users/owners');
        if (oRes.data) {
          setOwners(oRes.data);
        }
      } catch (e) {
        console.error('Failed to fetch owners', e);
      }
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [user]);

  const addTenant = (tenant: Omit<Tenant, 'id' | 'createdAt'>) => {
    const newTenant: Tenant = {
      ...tenant,
      id: `tenant-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setTenants(prev => [...prev, newTenant]);
  };

  const addTreasurer = (treasurer: Omit<Treasurer, 'id' | 'createdAt'> & { id?: string }) => {
    const newTreasurer: Treasurer = {
      ...treasurer,
      id: treasurer.id || `treasurer-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setTreasurers(prev => [...prev, newTreasurer]);
  };

  const updateTreasurer = (id: string, updates: Partial<Treasurer>) => {
    setTreasurers(prev => prev.map(t => (t.id === id ? { ...t, ...updates } : t)));
  };

  const deleteTreasurer = (id: string) => {
    setTreasurers(prev => prev.filter(t => t.id !== id));
  };

  return (
    <UserContext.Provider value={{ tenants, treasurers, owners, addTenant, addTreasurer, updateTreasurer, deleteTreasurer }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) throw new Error('useUser must be used within a UserProvider');
  return context;
}
