import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient from '../../services/api';
import { useAuth } from './AuthContext';
import { useProperty } from './PropertyContext';
import { toast } from 'sonner';
import { toLKRFromCents, toCentsFromLKR } from '../../utils/formatters';

export interface Lease {
  id: string;
  tenantId: string;
  unitId: string;
  startDate: string;
  endDate: string | null;
  monthlyRent: number;
  status: 'draft' | 'active' | 'expired' | 'ended' | 'cancelled';
  currentDepositBalance?: number;
  depositStatus?: 'pending' | 'paid' | 'awaiting_approval' | 'awaiting_acknowledgment' | 'disputed' | 'partially_refunded' | 'refunded';
  proposedRefundAmount?: number;
  refundNotes?: string;
  refundedAmount?: number;
  documentUrl?: string;
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  verificationRejectionReason?: string;
  noticeStatus?: 'undecided' | 'vacating' | 'renewing';
  unitNumber?: string;
  propertyId?: string;
  propertyName?: string;
  tenantName?: string;
  magicToken?: string;
  targetDeposit?: number;
  actualCheckoutAt?: string;
  createdAt: string;
}

export interface RenewalRequest {
  id: string;
  leaseId: string;
  currentMonthlyRent: number;
  proposedMonthlyRent: number | null;
  proposedEndDate: string | null;
  status: 'pending' | 'negotiating' | 'approved' | 'rejected' | 'cancelled';
  negotiationNotes: string | null;
  unitId?: string;
  unitNumber?: string;
  propertyName?: string;
  tenantName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaseTerm {
  id: number;
  leaseTermId: number; // For compatibility
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
  endLease: (id: string, terminationDate: string, terminationFee: number) => Promise<void>;
  renewLease: (id: string, newEndDate: string, newMonthlyRent?: number) => Promise<void>;
  refundDeposit: (id: string, amount: number, notes?: string) => Promise<void>;
  approveRefund: (id: string) => Promise<void>;
  acknowledgeRefund: (id: string) => Promise<void>;
  disputeRefund: (id: string, notes: string) => Promise<void>;
  updateLeaseDocument: (id: string, documentUrl: string) => Promise<void>;
  updateNoticeStatus: (id: string, status: 'undecided' | 'vacating' | 'renewing') => Promise<void>;
  leaseTerms: LeaseTerm[];
  addLeaseTerm: (term: Omit<LeaseTerm, 'id' | 'ownerId' | 'createdAt' | 'leaseTermId'>) => Promise<void>;
  updateLeaseTerm: (id: number, term: Partial<LeaseTerm>) => Promise<void>;
  deleteLeaseTerm: (id: number) => Promise<void>;
  finalizeCheckout: (id: string) => Promise<void>;
  activateLease: (id: string) => Promise<void>;
  verifyLeaseDocuments: (id: string) => Promise<void>;
  rejectLeaseDocuments: (id: string, reason: string) => Promise<void>;
  withdrawApplication: (id: string) => Promise<void>;
  cancelLease: (id: string) => Promise<void>;
  recordDisbursement: (id: string, data: { bankReferenceId: string; disbursementDate?: string }) => Promise<void>;

  // Renewal operations
  renewalRequests: RenewalRequest[];
  fetchRenewalRequests: () => Promise<void>;
  proposeRenewalTerms: (id: string, data: { proposedMonthlyRent: number; proposedEndDate: string; notes?: string }) => Promise<void>;
  approveRenewal: (id: string) => Promise<void>;
  rejectRenewal: (id: string) => Promise<void>;
}

const LeaseContext = createContext<LeaseContextType | undefined>(undefined);

export function LeaseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { updateUnit } = useProperty();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [leaseTerms, setLeaseTerms] = useState<LeaseTerm[]>([]);
  const [renewalRequests, setRenewalRequests] = useState<RenewalRequest[]>([]);

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
          monthlyRent: toLKRFromCents(l.monthlyRent),
          currentDepositBalance: toLKRFromCents(l.currentDepositBalance || 0),
          proposedRefundAmount: toLKRFromCents(l.proposedRefundAmount || 0),
          refundedAmount: toLKRFromCents(l.refundedAmount || 0),
          targetDeposit: toLKRFromCents(l.targetDeposit || 0),
        })));
      }
    } catch (e) {
      console.error('Failed to fetch leases', e);
    }
  };

  useEffect(() => {
    if (user) {
      fetchLeases();
      fetchRenewalRequests();
      if (user.role === 'owner' || user.role === 'treasurer') {
        fetchLeaseTerms();
      }
    }
  }, [user]);

  const addLease = async (lease: Omit<Lease, 'id' | 'createdAt'>) => {
    try {
      const response = await apiClient.post('/leases', {
        ...lease,
        monthlyRent: lease.monthlyRent,
        targetDeposit: lease.targetDeposit || 0,
      });
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

  const endLease = async (id: string, terminationDate: string, terminationFee: number) => {
    try {
      await apiClient.post(`/leases/${id}/terminate`, { terminationDate, terminationFee });
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
      await apiClient.post(`/leases/${id}/instant-renew`, { 
        newEndDate, 
        newMonthlyRent: newMonthlyRent ? newMonthlyRent : undefined 
      });
      await fetchLeases();
      toast.success('Renewal approved. A new draft lease is ready.');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to renew lease';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const refundDeposit = async (id: string, amount: number, notes?: string) => {
    try {
      await apiClient.post(`/leases/${id}/refund`, { 
        amount: amount, 
        notes 
      });
      await fetchLeases(); // Easier to refetch instead of manual mapping
      toast.success('Refund requested successfully');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to refund deposit';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const approveRefund = async (id: string) => {
    try {
      await apiClient.post(`/leases/${id}/refund/approve`);
      await fetchLeases();
      toast.success('Refund approved. Awaiting physical bank transfer confirmation.');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to approve refund';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const acknowledgeRefund = async (id: string) => {
    try {
      await apiClient.put(`/leases/${id}/acknowledge-refund`);
      await fetchLeases();
      toast.success('Refund settlement acknowledged.');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to acknowledge refund';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const disputeRefund = async (id: string, notes: string) => {
    try {
      await apiClient.post(`/leases/${id}/refund/dispute`, { notes });
      await fetchLeases();
      toast.success('Refund disputed successfully');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to dispute refund';
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

  const addLeaseTerm = async (term: Omit<LeaseTerm, 'id' | 'ownerId' | 'createdAt' | 'leaseTermId'>) => {
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

  const finalizeCheckout = async (id: string) => {
    try {
      await apiClient.post(`/leases/${id}/finalize-checkout`);
      setLeases(prev => prev.map(l => (l.id === id ? { ...l, status: 'ended' } : l)));
      const lease = leases.find(l => l.id === id);
      if (lease) await updateUnit(lease.unitId, { status: 'available' });
      toast.success('Lease checkout finalized. Unit is now available.');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to finalize checkout';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const activateLease = async (id: string) => {
    try {
      await apiClient.post(`/leases/${id}/sign`);
      await fetchLeases();
      toast.success('Lease signed and activated successfully.');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to sign lease';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const verifyLeaseDocuments = async (id: string) => {
    try {
      const response = await apiClient.post(`/leases/${id}/verify-documents`);
      await fetchLeases();
      toast.success(response.data.message);
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to verify documents';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const rejectLeaseDocuments = async (id: string, reason: string) => {
    try {
      await apiClient.post(`/leases/${id}/reject-documents`, { reason });
      await fetchLeases();
      toast.success('Documents rejected. Feedback sent to tenant.');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to reject documents';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const withdrawApplication = async (id: string) => {
    try {
      await apiClient.post(`/leases/${id}/withdraw`);
      await fetchLeases();
      toast.success('Your application has been withdrawn.');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to withdraw application';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const cancelLease = async (id: string) => {
    try {
      await apiClient.delete(`/leases/${id}`);
      await fetchLeases();
      toast.success('Lease reservation cancelled.');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to cancel lease';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const recordDisbursement = async (id: string, data: { bankReferenceId: string; disbursementDate?: string }) => {
    try {
      await apiClient.post(`/leases/${id}/refund/disburse`, data);
      await fetchLeases();
      toast.success('Disbursement recorded. Refund finalized.');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to record disbursement';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const fetchRenewalRequests = async () => {
    try {
      const response = await apiClient.get('/renewal-requests');
      setRenewalRequests(response.data.map((r: any) => ({
        ...r,
        currentMonthlyRent: toLKRFromCents(r.currentMonthlyRent),
        proposedMonthlyRent: r.proposedMonthlyRent ? toLKRFromCents(r.proposedMonthlyRent) : null,
      })));
    } catch (e) {
      console.error('Failed to fetch renewal requests', e);
    }
  };

  const proposeRenewalTerms = async (id: string, data: { proposedMonthlyRent: number; proposedEndDate: string; notes?: string }) => {
    try {
      await apiClient.post(`/renewal-requests/${id}/propose`, {
        ...data,
        proposedMonthlyRent: data.proposedMonthlyRent
      });
      toast.success('Renewal terms proposed successfully');
      fetchRenewalRequests();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to propose renewal terms');
      throw e;
    }
  };

  const approveRenewal = async (id: string) => {
    try {
      await apiClient.post(`/renewal-requests/${id}/approve`);
      toast.success('Renewal approved. New draft lease created.');
      fetchRenewalRequests();
      fetchLeases(); // New draft lease should appear
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to approve renewal');
      throw e;
    }
  };

  const rejectRenewal = async (id: string) => {
    try {
      await apiClient.post(`/renewal-requests/${id}/reject`);
      toast.success('Renewal request rejected');
      fetchRenewalRequests();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to reject renewal');
      throw e;
    }
  };

  return (
    <LeaseContext.Provider value={{ 
      leases, 
      addLease, 
      endLease, 
      renewLease, 
      refundDeposit,
      approveRefund,
      acknowledgeRefund,
      disputeRefund,
      updateLeaseDocument, 
      updateNoticeStatus,
      leaseTerms,
      addLeaseTerm,
      updateLeaseTerm,
      deleteLeaseTerm,
      finalizeCheckout,
      activateLease,
      verifyLeaseDocuments,
      rejectLeaseDocuments,
      withdrawApplication,
      renewalRequests,
      fetchRenewalRequests,
      proposeRenewalTerms,
      approveRenewal,
      rejectRenewal,
      cancelLease,
      recordDisbursement
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
