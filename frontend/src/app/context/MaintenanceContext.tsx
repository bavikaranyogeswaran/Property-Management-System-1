import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { maintenanceApi, invoiceApi } from '../../services/api';
import { useAuth } from './AuthContext';
import { useFinancial } from './FinancialContext';
import { toast } from 'sonner';

export interface MaintenanceRequest {
  id: string;
  tenantId: string;
  unitId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  status: 'submitted' | 'in_progress' | 'completed' | 'cancelled';
  submittedDate: string;
  completedDate?: string;
  images?: string[];
}

export interface MaintenanceCost {
  id: string;
  requestId: string;
  amount: number;
  description: string;
  recordedDate: string;
  billToTenant?: boolean;
}

interface MaintenanceContextType {
  maintenanceRequests: MaintenanceRequest[];
  maintenanceCosts: MaintenanceCost[];
  addMaintenanceRequest: (request: Omit<MaintenanceRequest, 'id' | 'submittedDate'> | FormData) => Promise<void>;
  updateMaintenanceRequest: (id: string, request: Partial<MaintenanceRequest>) => Promise<void>;
  addMaintenanceCost: (cost: Omit<MaintenanceCost, 'id' | 'recordedDate'>) => Promise<void>;
  deleteMaintenanceCost: (id: string) => Promise<void>;
  createMaintenanceInvoice: (requestId: string, amount: number, description: string, dueDate?: string) => Promise<void>;
}

const MaintenanceContext = createContext<MaintenanceContextType | undefined>(undefined);

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [maintenanceCosts, setMaintenanceCosts] = useState<MaintenanceCost[]>([]);

  const fetchMaintenanceData = async () => {
    try {
      const mRes = await maintenanceApi.getRequests();
      if (mRes.data) {
        setMaintenanceRequests(mRes.data.map((r: any) => ({
          id: (r.request_id || r.id).toString(),
          tenantId: (r.tenant_id || r.tenantId).toString(),
          unitId: (r.unit_id || r.unitId).toString(),
          title: r.title,
          description: r.description,
          priority: r.priority,
          category: r.category || 'general',
          status: r.status,
          submittedDate: (r.created_at || r.createdAt || r.submittedDate || '').split('T')[0],
          images: r.images,
        })));
      }

      if (user?.role === 'owner' || user?.role === 'treasurer') {
        const mcRes = await maintenanceApi.getCosts('');
        if (mcRes.data) {
          setMaintenanceCosts(mcRes.data.map((c: any) => ({
            id: c.cost_id.toString(),
            requestId: c.request_id.toString(),
            amount: parseFloat(c.amount),
            description: c.description,
            recordedDate: (c.recorded_date || '').split('T')[0],
          })));
        }
      }
    } catch (e) {
      console.error('Failed to fetch maintenance data', e);
    }
  };

  useEffect(() => {
    if (user) fetchMaintenanceData();
  }, [user]);

  const addMaintenanceRequest = async (request: Omit<MaintenanceRequest, 'id' | 'submittedDate'> | FormData) => {
    try {
      await maintenanceApi.createRequest(request);
      toast.success('Maintenance request submitted');
      await fetchMaintenanceData();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to submit request');
    }
  };

  const updateMaintenanceRequest = async (id: string, updates: Partial<MaintenanceRequest>) => {
    try {
      if (updates.status) {
        await maintenanceApi.updateStatus(id, updates.status);
        toast.success('Status updated');
        await fetchMaintenanceData();
      }
    } catch (e) {
      toast.error('Failed to update status');
    }
  };

  const addMaintenanceCost = async (cost: Omit<MaintenanceCost, 'id' | 'recordedDate'>) => {
    try {
      await maintenanceApi.addCost(cost);
      toast.success(cost.billToTenant ? 'Cost recorded & Invoice generated' : 'Cost recorded');
      await fetchMaintenanceData();
    } catch (e) {
      toast.error('Failed to record cost');
    }
  };

  const deleteMaintenanceCost = async (id: string) => {
    try {
      await maintenanceApi.deleteCost(id);
      toast.success('Cost deleted');
      setMaintenanceCosts(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      toast.error('Failed to delete cost');
    }
  };

  const createMaintenanceInvoice = async (requestId: string, amount: number, description: string, dueDate?: string) => {
    try {
      await maintenanceApi.createInvoice({ requestId, amount, description, dueDate });
      toast.success('Maintenance invoice created successfully');
    } catch (e: any) {
      toast.error(`Failed to create invoice: ${e.response?.data?.error || e.message}`);
    }
  };

  return (
    <MaintenanceContext.Provider value={{ maintenanceRequests, maintenanceCosts, addMaintenanceRequest, updateMaintenanceRequest, addMaintenanceCost, deleteMaintenanceCost, createMaintenanceInvoice }}>
      {children}
    </MaintenanceContext.Provider>
  );
}

export function useMaintenance() {
  const context = useContext(MaintenanceContext);
  if (context === undefined) throw new Error('useMaintenance must be used within a MaintenanceProvider');
  return context;
}
