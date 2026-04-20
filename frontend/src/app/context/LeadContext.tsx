// ============================================================================
//  LEAD CONTEXT (The Marketing Desk)
// ============================================================================
//  This context manages raw prospects and potential tenants.
//  It handles initial inquiries, scheduled viewing tours, and the
//  conversion process to turn a Lead into a Paying Tenant.
// ============================================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import apiClient from '../../services/api';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { enqueueFetch } from '../../utils/fetchQueue';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  interestedUnit: string;
  propertyId: string;
  status: 'interested' | 'viewed' | 'converted' | 'dropped';
  createdAt: string;
  notes: string;
  internalNotes?: string;
  lastContactedAt?: string;
  items?: any[];
  tenantId?: string;
  score?: number;
  moveInDate?: string;
  occupantsCount?: number;
  preferredTermMonths?: number;
  leaseTermId?: string;
}

export interface LeadStageHistory {
  id: string;
  leadId: string;
  fromStatus: Lead['status'] | null;
  toStatus: Lead['status'];
  changedAt: string;
  notes?: string;
  durationInPreviousStage?: number;
}

export interface Visit {
  id: string;
  propertyId: string;
  unitId: string | null;
  leadId: string | null;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  scheduledDate: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no-show';
  notes: string;
  createdAt: string;
  propertyName?: string;
  unitNumber?: string;
  leadStatus?: string;
}

interface LeadContextType {
  leads: Lead[];
  leadStageHistory: LeadStageHistory[];
  visits: Visit[];
  addLead: (lead: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>;
  updateLead: (id: string, lead: Partial<Lead>) => Promise<void>;
  convertLeadToTenant: (
    leadId: string,
    startDate?: string,
    endDate?: string,
    data?: any
  ) => Promise<string>;
  fetchVisits: () => Promise<void>;
  fetchLeads: () => Promise<void>;
  fetchStageHistory: () => Promise<void>;
  scheduleVisit: (visitData: any) => Promise<any>;
  updateVisitStatus: (id: string, status: Visit['status']) => Promise<void>;
}

const LeadContext = createContext<LeadContextType | undefined>(undefined);

export function LeadProvider({ children }: { children: ReactNode }) {
  // 1. [DEPENDENCIES] Context Injection: Accesses global user role for scoping lead visibility
  const { user } = useAuth();

  // 2. [STATE] Marketing Buffers: Holds the sales funnel, event history, and property tour schedules
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadStageHistory, setLeadStageHistory] = useState<LeadStageHistory[]>(
    []
  );
  const [visits, setVisits] = useState<Visit[]>([]);

  // FETCH LEADS: Retrieves prospects from the CRM.
  const fetchLeads = async () => {
    try {
      // 1. [SECURITY] Role Gate: Leads are typically restricted to administrative roles
      if (user?.role !== 'owner' && user?.role !== 'treasurer') return;
      // 2. [API] Extraction
      const response = await apiClient.get('/leads');
      if (response.data) {
        // 3. [TRANSFORMATION] Data Normalization: standardizes composite IDs for frontend state
        setLeads(
          response.data.map((l: any) => ({
            ...l,
            id: l.id.toString(),
            interestedUnit: l.interestedUnit?.toString(),
            propertyId: l.propertyId?.toString(),
            tenantId: l.tenantId?.toString(),
          }))
        );
      }
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    }
  };

  // FETCH STAGE HISTORY: Loads the audit trail for funnel progression.
  const fetchStageHistory = async () => {
    try {
      if (user?.role !== 'owner' && user?.role !== 'treasurer') return;
      const response = await apiClient.get('/leads/stage-history');
      if (response.data) setLeadStageHistory(response.data);
    } catch (error) {
      console.error('Failed to fetch lead stage history:', error);
    }
  };

  // FETCH VISITS: Retrieves the property viewing calendar.
  const fetchVisits = async () => {
    try {
      if (user?.role !== 'owner' && user?.role !== 'treasurer') return;
      const response = await apiClient.get('/visits');
      setVisits(response.data);
    } catch (error) {
      console.error('Failed to fetch visits:', error);
    }
  };

  // INITIALIZATION EFFECT: Refresh marketing data on identity change.
  useEffect(() => {
    if (user) {
      // 1. [OPTIMIZATION] Sequential Execution: utilizes a shared global queue to prevent API request storms on login
      enqueueFetch(fetchLeads);
      enqueueFetch(fetchStageHistory);
      enqueueFetch(fetchVisits);
    }
  }, [user]);

  // ADD LEAD: Registers a new prospect in the funnel.
  const addLead = async (lead: Omit<Lead, 'id' | 'createdAt'>) => {
    try {
      // 1. [API] Persistence
      const response = await apiClient.post('/leads', lead);
      // 2. [SYNC] Local State Update with server-assigned ID
      const newLead: Lead = {
        ...lead,
        id: response.data.id.toString(),
        createdAt: new Date().toISOString().split('T')[0],
      };
      setLeads((prev) => [...prev, newLead]);
      // 3. [AUDIT] Manual Stage Logging: recording the initial funnel entry
      setLeadStageHistory((prev) => [
        ...prev,
        {
          id: `history-${Date.now()}`,
          leadId: newLead.id,
          fromStatus: null,
          toStatus: lead.status,
          changedAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error('Failed to add lead:', error);
      throw error;
    }
  };

  // UPDATE LEAD: Modifies prospect details and funnel status.
  const updateLead = async (id: string, updates: Partial<Lead>) => {
    try {
      // 1. [API] Persistence
      await apiClient.put(`/leads/${id}`, updates);

      // 2. [UI] Optimistic Update: Provides instant visual feedback for status changes
      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
      );

      // 3. [SYNC] Verification: Re-fetches the entire domain to reconcile server-side side effects
      // (e.g., status changes that trigger automatic visit cancellations or history logging)
      await Promise.all([fetchLeads(), fetchVisits(), fetchStageHistory()]);
    } catch (error) {
      console.error('Failed to update lead:', error);
      throw error;
    }
  };

  // CONVERT LEAD TO TENANT: Orchestrates the transformation of a prospect into a customer.
  const convertLeadToTenant = async (
    leadId: string,
    startDate?: string,
    endDate?: string,
    data?: any
  ) => {
    try {
      // 1. [TRANSFORMATION] Payload Prep: Combines rental terms and unit selection
      const payload: any = { startDate, endDate };
      if (typeof data === 'string') payload.unitId = data;
      else if (data) Object.assign(payload, data);

      // 2. [API] Conversion: Triggers complex backend routine (Unit status change, Lease generation, User creation)
      const response = await apiClient.post(
        `/leads/${leadId}/convert`,
        payload
      );

      // 3. [LIFECYCLE] Hard Reset: Forced reload to ensure the new user context (Tenant dashboard) is initialized
      window.location.reload();
      return response.data.tenantId;
    } catch (error) {
      console.error('Failed to convert lead:', error);
      throw error;
    }
  };

  // SCHEDULE VISIT: Adds a viewing appointment to the calendar.
  const scheduleVisit = async (visitData: any) => {
    try {
      // 1. [API] Persistence
      const response = await apiClient.post('/visits', visitData);
      // 2. [SYNC] Refresh Calendar
      await fetchVisits();
      return response.data;
    } catch (error) {
      console.error('Failed to schedule visit:', error);
      throw error;
    }
  };

  // UPDATE VISIT STATUS: Manually updates the state of a property tour.
  const updateVisitStatus = async (id: string, status: Visit['status']) => {
    try {
      // 1. [API] Update
      await apiClient.patch(`/visits/${id}/status`, { status });
      // 2. [SYNC] Selective state update
      setVisits((prev) =>
        prev.map((v) => (v.id === id ? { ...v, status } : v))
      );
      toast.success(`Visit ${status}`);
    } catch (error) {
      console.error('Failed to update visit status:', error);
      toast.error('Failed to update visit status');
    }
  };

  return (
    <LeadContext.Provider
      value={{
        leads,
        leadStageHistory,
        visits,
        addLead,
        updateLead,
        convertLeadToTenant,
        fetchVisits,
        fetchLeads,
        fetchStageHistory,
        scheduleVisit,
        updateVisitStatus,
      }}
    >
      {children}
    </LeadContext.Provider>
  );
}

export function useLead() {
  const context = useContext(LeadContext);
  if (context === undefined)
    throw new Error('useLead must be used within a LeadProvider');
  return context;
}
