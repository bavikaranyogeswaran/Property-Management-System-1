// ============================================================================
//  MAINTENANCE CONTEXT (The Repair Coordinator)
// ============================================================================
//  This context manages the "Fix-it" requests from tenants.
//  It tracks the status of repairs and handles the complex billing logic for
//  charging either the Owner or the Tenant for the work done.
// ============================================================================

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
  // 1. [DEPENDENCIES] Context Injection: Accesses global identity for role-based scoping and cost visibility
  const { user } = useAuth();

  // 2. [STATE] Operational Buffers: Holds reactive lists of active repair requests and their associated line-item costs
  const [maintenanceRequests, setMaintenanceRequests] = useState<
    MaintenanceRequest[]
  >([]);
  const [maintenanceCosts, setMaintenanceCosts] = useState<MaintenanceCost[]>(
    []
  );

  // FETCH MAINTENANCE DATA: Hydrates the repair log and expense ledgers.
  const fetchMaintenanceData = async () => {
    try {
      // 1. [API] Extraction: Fetch core repair requests
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

      // 2. [SECURITY] Role Gate: Only administrative roles can see centralized maintenance cost ledgers
      if (user?.role === 'owner' || user?.role === 'treasurer') {
        const mcRes = await maintenanceApi.getCosts('');
        if (mcRes.data) {
          // 3. [TRANSFORMATION] Data Normalization: Resolves raw database cents into UI decimals
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

  // INITIALIZATION EFFECT: Refresh operational data on identity change.
  useEffect(() => {
    if (user) enqueueFetch(fetchMaintenanceData);
  }, [user]);

  // ADD MAINTENANCE REQUEST: Registers a new fix-it ticket with optional photo evidence.
  const addMaintenanceRequest = async (
    request: Omit<MaintenanceRequest, 'id' | 'submittedDate'> | FormData
  ) => {
    try {
      // 1. [API] Persistence: Supports both JSON and Multipart (FormData) for image uploads
      await maintenanceApi.createRequest(request);
      toast.success('Maintenance request submitted');
      // 2. [SYNC] Refresh Log
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

  // UPDATE MAINTENANCE REQUEST: Manages the repair lifecycle from 'submitted' to 'completed'.
  const updateMaintenanceRequest = async (
    id: string,
    updates: Partial<MaintenanceRequest>
  ) => {
    try {
      // 1. [API] Execution
      if (updates.status) {
        await maintenanceApi.updateStatus(id, updates.status);
        toast.success('Status updated');
        // 2. [SYNC] Refresh
        await fetchMaintenanceData();
      }
    } catch (e: any) {
      const errorMessage =
        e.response?.data?.message || e.message || 'Failed to update status';
      toast.error(errorMessage);
    }
  };

  // ADD MAINTENANCE COST: Records a billable expense against a specific request.
  const addMaintenanceCost = async (
    cost: Omit<MaintenanceCost, 'id' | 'recordedDate'>
  ) => {
    try {
      // 1. [API] Persistence: Includes currency normalization (LKR to Cents)
      await maintenanceApi.addCost({
        ...cost,
        amount: toCentsFromLKR(cost.amount),
      });
      // 2. [UI] Feedback: specifically calls out the responsible party for the expense
      toast.success(
        cost.billTo === 'tenant'
          ? 'Cost recorded (Billed to Tenant)'
          : 'Cost recorded (Billed to Owner)'
      );
      // 3. [SYNC]
      await fetchMaintenanceData();
    } catch (e) {
      toast.error('Failed to record cost');
    }
  };

  // DELETE MAINTENANCE COST: Removes a misrecorded expense entry.
  const deleteMaintenanceCost = async (id: string) => {
    try {
      await maintenanceApi.deleteCost(id);
      toast.success('Cost deleted');
      // 1. [SYNC] Selective local update
      setMaintenanceCosts((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      toast.error('Failed to delete cost');
    }
  };

  // CREATE MAINTENANCE INVOICE: Manually bills a tenant for repair work.
  const createMaintenanceInvoice = async (
    requestId: string,
    amount: number,
    description: string,
    dueDate?: string
  ) => {
    try {
      // 1. [API] Execution: Triggers the generation of a specialized RentInvoice for maintenance
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
