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
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadStageHistory, setLeadStageHistory] = useState<LeadStageHistory[]>(
    []
  );
  const [visits, setVisits] = useState<Visit[]>([]);

  const fetchLeads = async () => {
    try {
      if (user?.role !== 'owner' && user?.role !== 'treasurer') return;
      const response = await apiClient.get('/leads');
      if (response.data) {
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

  const fetchStageHistory = async () => {
    try {
      if (user?.role !== 'owner' && user?.role !== 'treasurer') return;
      const response = await apiClient.get('/leads/stage-history');
      if (response.data) setLeadStageHistory(response.data);
    } catch (error) {
      console.error('Failed to fetch lead stage history:', error);
    }
  };

  const fetchVisits = async () => {
    try {
      if (user?.role !== 'owner' && user?.role !== 'treasurer') return;
      const response = await apiClient.get('/visits');
      setVisits(response.data);
    } catch (error) {
      console.error('Failed to fetch visits:', error);
    }
  };

  useEffect(() => {
    if (user) {
      // Sequential fetch via shared queue to prevent request storms on mount
      enqueueFetch(fetchLeads);
      enqueueFetch(fetchStageHistory);
      enqueueFetch(fetchVisits);
    }
  }, [user]);

  const addLead = async (lead: Omit<Lead, 'id' | 'createdAt'>) => {
    try {
      const response = await apiClient.post('/leads', lead);
      const newLead: Lead = {
        ...lead,
        id: response.data.id.toString(),
        createdAt: new Date().toISOString().split('T')[0],
      };
      setLeads((prev) => [...prev, newLead]);
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

  const updateLead = async (id: string, updates: Partial<Lead>) => {
    try {
      await apiClient.put(`/leads/${id}`, updates);

      // Optimistic local update for instant UI feedback
      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
      );

      // Re-fetch all relevant data in the background to ensure frontend is perfectly in sync
      // with backend side effects (e.g. cancelled visits, new history records, etc.)
      // Note: We don't await this if we want absolute instant response, but awaiting ensures
      // we don't finish the function until the data is "officially" refreshed.
      await Promise.all([fetchLeads(), fetchVisits(), fetchStageHistory()]);
    } catch (error) {
      console.error('Failed to update lead:', error);
      throw error;
    }
  };

  const convertLeadToTenant = async (
    leadId: string,
    startDate?: string,
    endDate?: string,
    data?: any
  ) => {
    try {
      const payload: any = { startDate, endDate };
      if (typeof data === 'string') payload.unitId = data;
      else if (data) Object.assign(payload, data);
      const response = await apiClient.post(
        `/leads/${leadId}/convert`,
        payload
      );
      window.location.reload();
      return response.data.tenantId;
    } catch (error) {
      console.error('Failed to convert lead:', error);
      throw error;
    }
  };

  const scheduleVisit = async (visitData: any) => {
    try {
      const response = await apiClient.post('/visits', visitData);
      await fetchVisits();
      return response.data;
    } catch (error) {
      console.error('Failed to schedule visit:', error);
      throw error;
    }
  };

  const updateVisitStatus = async (id: string, status: Visit['status']) => {
    try {
      await apiClient.patch(`/visits/${id}/status`, { status });
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
