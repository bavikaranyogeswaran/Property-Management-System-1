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
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
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
      if (user?.role !== 'owner') return;
      const response = await apiClient.get('/leads');
      if (response.status === 200) {
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
      if (user?.role !== 'owner') return;
      const response = await apiClient.get('/leads/stage-history');
      if (response.status === 200) setLeadStageHistory(response.data);
    } catch (error) {
      console.error('Failed to fetch lead stage history:', error);
    }
  };

  const fetchVisits = async () => {
    try {
      if (user?.role !== 'owner') return;
      const response = await apiClient.get('/visits');
      setVisits(response.data);
    } catch (error) {
      console.error('Failed to fetch visits:', error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchLeads();
      fetchStageHistory();
      fetchVisits();
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
      const currentLead = leads.find((l) => l.id === id);
      if (
        currentLead &&
        updates.status &&
        updates.status !== currentLead.status
      ) {
        const history = leadStageHistory
          .filter((h) => h.leadId === id)
          .sort(
            (a, b) =>
              new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
          )[0];
        const duration = history
          ? Math.floor(
              (new Date().getTime() - new Date(history.changedAt).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : 0;
        const toStatus = updates.status as Lead['status'];
        setLeadStageHistory((prev) => [
          ...prev,
          {
            id: `history-${Date.now()}`,
            leadId: id,
            fromStatus: currentLead.status,
            toStatus,
            changedAt: new Date().toISOString(),
            durationInPreviousStage: duration,
          },
        ]);
      }
      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
      );
    } catch (error) {
      console.error('Failed to update lead:', error);
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
