import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { maintenanceApi, invoiceApi } from '../../services/api';
import { useAuth } from './AuthContext';
import { useFinancial } from './FinancialContext';
import { toast } from 'sonner';
import { toLKRFromCents, toCentsFromLKR } from '../../utils/formatters';
import { enqueueFetch } from '../../utils/fetchQueue';

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
  unitNumber?: string;
  propertyName?: string;
}

export interface MaintenanceCost {
  id: string;
  requestId: string;
  amount: number;
  description: string;
  recordedDate: string;
  billTo?: 'owner' | 'tenant';
}

interface MaintenanceContextType {
  maintenanceRequests: MaintenanceRequest[];
  maintenanceCosts: MaintenanceCost[];
  addMaintenanceRequest: (
    request: Omit<MaintenanceRequest, 'id' | 'submittedDate'> | FormData
  ) => Promise<void>;
  updateMaintenanceRequest: (
    id: string,
    request: Partial<MaintenanceRequest>
  ) => Promise<void>;
  addMaintenanceCost: (
    cost: Omit<MaintenanceCost, 'id' | 'recordedDate'>
  ) => Promise<void>;
  deleteMaintenanceCost: (id: string) => Promise<void>;
  createMaintenanceInvoice: (
    requestId: string,
    amount: number,
    description: string,
    dueDate?: string
  ) => Promise<void>;
}

const MaintenanceContext = createContext<MaintenanceContextType | undefined>(
  undefined
);

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [maintenanceRequests, setMaintenanceRequests] = useState<
    MaintenanceRequest[]
  >([]);
  const [maintenanceCosts, setMaintenanceCosts] = useState<MaintenanceCost[]>(
    []
  );

  const fetchMaintenanceData = async () => {
    try {
      const mRes = await maintenanceApi.getRequests();
      if (mRes.data) {
        setMaintenanceRequests(
          mRes.data.map((r: any) => ({
            ...r,
            id: String(r.id || r.request_id),
            tenantId: r.tenantId ? String(r.tenantId) : undefined,
            unitId: r.unitId ? String(r.unitId) : undefined,
            submittedDate: (r.createdAt || '').split('T')[0],
            unitNumber: r.unitNumber,
            propertyName: r.propertyName,
          }))
        );
      }

      if (user?.role === 'owner' || user?.role === 'treasurer') {
        const mcRes = await maintenanceApi.getCosts('');
        if (mcRes.data) {
          setMaintenanceCosts(
            mcRes.data.map((c: any) => ({
              ...c,
              id: String(c.id || c.cost_id),
              requestId: c.requestId ? String(c.requestId) : undefined,
              amount: toLKRFromCents(c.amount),
              recordedDate: (c.recordedDate || '').split('T')[0],
              billTo: c.billTo || 'owner',
            }))
          );
        }
      }
    } catch (e) {
      console.error('Failed to fetch maintenance data', e);
    }
  };

  useEffect(() => {
    if (user) enqueueFetch(fetchMaintenanceData);
  }, [user]);

  const addMaintenanceRequest = async (
    request: Omit<MaintenanceRequest, 'id' | 'submittedDate'> | FormData
  ) => {
    try {
      await maintenanceApi.createRequest(request);
      toast.success('Maintenance request submitted');
      await fetchMaintenanceData();
    } catch (e: any) {
      const errorMsg =
        e.response?.data?.message ||
        e.response?.data?.error ||
        'Failed to submit request';
      toast.error(errorMsg);
      throw e;
    }
  };

  const updateMaintenanceRequest = async (
    id: string,
    updates: Partial<MaintenanceRequest>
  ) => {
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

  const addMaintenanceCost = async (
    cost: Omit<MaintenanceCost, 'id' | 'recordedDate'>
  ) => {
    try {
      await maintenanceApi.addCost({
        ...cost,
        amount: toCentsFromLKR(cost.amount),
      });
      toast.success(
        cost.billTo === 'tenant'
          ? 'Cost recorded (Billed to Tenant)'
          : 'Cost recorded (Billed to Owner)'
      );
      await fetchMaintenanceData();
    } catch (e) {
      toast.error('Failed to record cost');
    }
  };

  const deleteMaintenanceCost = async (id: string) => {
    try {
      await maintenanceApi.deleteCost(id);
      toast.success('Cost deleted');
      setMaintenanceCosts((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      toast.error('Failed to delete cost');
    }
  };

  const createMaintenanceInvoice = async (
    requestId: string,
    amount: number,
    description: string,
    dueDate?: string
  ) => {
    try {
      await maintenanceApi.createInvoice({
        requestId,
        amount: toCentsFromLKR(amount),
        description,
        dueDate,
      });
      toast.success('Maintenance invoice created successfully');
    } catch (e: any) {
      toast.error(
        `Failed to create invoice: ${e.response?.data?.error || e.message}`
      );
    }
  };

  return (
    <MaintenanceContext.Provider
      value={{
        maintenanceRequests,
        maintenanceCosts,
        addMaintenanceRequest,
        updateMaintenanceRequest,
        addMaintenanceCost,
        deleteMaintenanceCost,
        createMaintenanceInvoice,
      }}
    >
      {children}
    </MaintenanceContext.Provider>
  );
}

export function useMaintenance() {
  const context = useContext(MaintenanceContext);
  if (context === undefined)
    throw new Error('useMaintenance must be used within a MaintenanceProvider');
  return context;
}
