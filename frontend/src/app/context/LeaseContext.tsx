import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient from '../../services/api';
import { useAuth } from './AuthContext';
import { useProperty } from './PropertyContext';
import { toast } from 'sonner';

export interface Lease {
  id: string;
  tenantId: string;
  unitId: string;
  startDate: string;
  endDate: string | null;
  monthlyRent: number;
  status: 'active' | 'ended' | 'cancelled';
  securityDeposit?: number;
  depositStatus?: 'pending' | 'paid' | 'partially_refunded' | 'refunded';
  refundedAmount?: number;
  documentUrl?: string;
  noticeStatus?: 'undecided' | 'vacating' | 'renewing';
  createdAt: string;
}

export interface LeaseTerm {
  leaseTermId: number;
  ownerId: number;
  name: string;
  type: 'fixed' | 'periodic';
  durationMonths?: number;
  noticePeriodMonths: number;
  isDefault: boolean;
  createdAt: string;
}

interface LeaseContextType {
  leases: Lease[];
  addLease: (lease: Omit<Lease, 'id' | 'createdAt'>) => Promise<void>;
  endLease: (id: string) => Promise<void>;
  renewLease: (id: string, newEndDate: string, newMonthlyRent?: number) => Promise<void>;
  refundDeposit: (id: string, amount: number) => Promise<void>;
  updateLeaseDocument: (id: string, documentUrl: string) => Promise<void>;
  updateNoticeStatus: (id: string, status: 'undecided' | 'vacating' | 'renewing') => Promise<void>;
  leaseTerms: LeaseTerm[];
  addLeaseTerm: (term: Omit<LeaseTerm, 'leaseTermId' | 'ownerId' | 'createdAt'>) => Promise<void>;
  updateLeaseTerm: (id: number, term: Partial<LeaseTerm>) => Promise<void>;
  deleteLeaseTerm: (id: number) => Promise<void>;
}

const LeaseContext = createContext<LeaseContextType | undefined>(undefined);

export function LeaseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { updateUnit } = useProperty();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [leaseTerms, setLeaseTerms] = useState<LeaseTerm[]>([]);

  const fetchLeaseTerms = async () => {
    try {
      const response = await apiClient.get('/lease-terms');
      setLeaseTerms(response.data);
    } catch (e) {
      console.error('Failed to fetch lease terms', e);
    }
  };

  const fetchLeases = async () => {
    try {
      const lRes = await apiClient.get('/leases');
      if (lRes.data) {
        setLeases(lRes.data.map((l: any) => ({
          ...l,
          id: l.id?.toString() || l.lease_id?.toString(),
          tenantId: l.tenantId?.toString() || l.tenant_id?.toString(),
          unitId: l.unitId?.toString() || l.unit_id?.toString(),
          documentUrl: l.documentUrl || l.document_url,
          noticeStatus: l.noticeStatus || l.notice_status,
        })));
      }
    } catch (e) {
      console.error('Failed to fetch leases', e);
    }
  };

  useEffect(() => {
    if (user) {
      fetchLeases();
      if (user.role === 'owner') fetchLeaseTerms();
    }
  }, [user]);

  const addLease = async (lease: Omit<Lease, 'id' | 'createdAt'>) => {
    try {
      const response = await apiClient.post('/leases', lease);
      const constructedLease: Lease = {
        ...lease,
        id: response.data.id,
        createdAt: new Date().toISOString().split('T')[0],
      };
      setLeases(prev => [...prev, constructedLease]);
      await updateUnit(lease.unitId, { status: 'occupied' });
    } catch (error) {
      console.error('Failed to create lease:', error);
      throw error;
    }
  };

  const endLease = async (id: string) => {
    try {
      await apiClient.post(`/leases/${id}/terminate`);
      setLeases(prev => prev.map(l => (l.id === id ? { ...l, status: 'ended' } : l)));
      const lease = leases.find(l => l.id === id);
      if (lease) await updateUnit(lease.unitId, { status: 'available' });
      toast.success('Lease ended successfully');
    } catch (e) {
      console.error('Failed to end lease', e);
      toast.error('Failed to end lease');
      throw e;
    }
  };

  const renewLease = async (id: string, newEndDate: string, newMonthlyRent?: number) => {
    try {
      await apiClient.put(`/leases/${id}/renew`, { newEndDate, newMonthlyRent });
      setLeases(prev => prev.map(l => (l.id === id ? { ...l, endDate: newEndDate, monthlyRent: newMonthlyRent || l.monthlyRent } : l)));
      toast.success('Lease renewed successfully');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to renew lease';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const refundDeposit = async (id: string, amount: number) => {
    try {
      await apiClient.post(`/leases/${id}/refund`, { amount });
      const lRes = await apiClient.get('/leases');
      setLeases(lRes.data.map((l: any) => ({
        ...l,
        id: l.id?.toString() || l.lease_id?.toString(),
        tenantId: l.tenantId?.toString() || l.tenant_id?.toString(),
        unitId: l.unitId?.toString() || l.unit_id?.toString(),
        documentUrl: l.documentUrl || l.document_url,
      })));
      toast.success('Deposit refunded successfully');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to refund deposit';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const updateLeaseDocument = async (id: string, documentUrl: string) => {
    try {
      await apiClient.patch(`/leases/${id}/document`, { documentUrl });
      setLeases(prev => prev.map(l => (l.id === id ? { ...l, documentUrl } : l)));
      toast.success('Document updated successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update document');
      throw error;
    }
  };

  const updateNoticeStatus = async (id: string, status: 'undecided' | 'vacating' | 'renewing') => {
    try {
      await apiClient.patch(`/leases/${id}/notice-status`, { status });
      setLeases(prev => prev.map(l => (l.id === id ? { ...l, noticeStatus: status } : l)));
      toast.success(`Intent updated to: ${status}`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update intent');
      throw error;
    }
  };

  const addLeaseTerm = async (term: Omit<LeaseTerm, 'leaseTermId' | 'ownerId' | 'createdAt'>) => {
    try {
      await apiClient.post('/lease-terms', term);
      await fetchLeaseTerms();
      toast.success('Lease term added successfully');
    } catch (error) {
      toast.error('Failed to add lease term');
      throw error;
    }
  };

  const updateLeaseTerm = async (id: number, term: Partial<LeaseTerm>) => {
    try {
      await apiClient.put(`/lease-terms/${id}`, term);
      await fetchLeaseTerms();
      toast.success('Lease term updated successfully');
    } catch (error) {
      toast.error('Failed to update lease term');
      throw error;
    }
  };

  const deleteLeaseTerm = async (id: number) => {
    try {
      await apiClient.delete(`/lease-terms/${id}`);
      await fetchLeaseTerms();
      toast.success('Lease term deleted successfully');
    } catch (error) {
      toast.error('Failed to delete lease term');
      throw error;
    }
  };

  return (
    <LeaseContext.Provider value={{ 
      leases, 
      addLease, 
      endLease, 
      renewLease, 
      refundDeposit, 
      updateLeaseDocument, 
      updateNoticeStatus,
      leaseTerms,
      addLeaseTerm,
      updateLeaseTerm,
      deleteLeaseTerm
    }}>
      {children}
    </LeaseContext.Provider>
  );
}

export function useLease() {
  const context = useContext(LeaseContext);
  if (context === undefined) throw new Error('useLease must be used within a LeaseProvider');
  return context;
}
