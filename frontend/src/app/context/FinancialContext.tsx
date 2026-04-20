// ============================================================================
//  FINANCIAL CONTEXT (The Virtual Banker)
// ============================================================================
//  This context treats the room list like a bank. It manages Invoices,
//  manual Payment verifications (bank slips), and automated Late Fee audits.
//  It ensures that every cent is accounted for across the properties.
// ============================================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import apiClient, {
  invoiceApi,
  paymentApi,
  receiptApi,
} from '../../services/api';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { toLKRFromCents, toCentsFromLKR } from '../../utils/formatters';
import { enqueueFetch } from '../../utils/fetchQueue';

export interface RentInvoice {
  id: string;
  leaseId: string;
  tenantId: string;
  unitId: string;
  amount: number;
  amountPaid?: number;
  dueDate: string;
  status: 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'void';
  description?: string;
  generatedDate: string;
  tenantName?: string;
  propertyName?: string;
  unitNumber?: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  tenantId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber: string;
  status: 'pending' | 'verified' | 'rejected';
  submittedAt: string;
  proofUrl?: string;
}

export interface Receipt {
  id: string;
  paymentId: string;
  invoiceId: string;
  tenantId: string;
  amount: number;
  generatedDate: string;
  receiptNumber: string;
  propertyName?: string;
  unitNumber?: string;
  tenantName?: string;
  tenantEmail?: string;
  paymentMethod?: string;
  paymentDate?: string;
  description?: string;
}

export interface LedgerSummary {
  totalRevenue: number;
  totalLiabilityHeld: number;
  totalLiabilityRefunded: number;
  netLiability: number;
  totalExpense: number;
  netOperatingIncome: number;
}

interface FinancialContextType {
  invoices: RentInvoice[];
  payments: Payment[];
  receipts: Receipt[];
  fetchLedgerSummary: (year: number) => Promise<LedgerSummary>;
  generateMonthlyInvoices: () => Promise<void>;
  submitPayment: (
    payment: Omit<Payment, 'id' | 'submittedAt'> | FormData,
    idempotencyKey?: string
  ) => Promise<void>;
  verifyPayment: (id: string, approved: boolean) => Promise<void>;
  runLateFeeAudit: () => Promise<void>;
  refreshData: () => Promise<void>;
}

const FinancialContext = createContext<FinancialContextType | undefined>(
  undefined
);

export function FinancialProvider({ children }: { children: ReactNode }) {
  // 1. [DEPENDENCIES] Context Injection: Accesses global identity to scope financial records
  const { user } = useAuth();

  // 2. [STATE] Ledger Buffers: Holds the reactive lists of financial instruments
  const [invoices, setInvoices] = useState<RentInvoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  // FETCH FINANCIAL DATA: Hydrates the various ledgers with normalized amounts.
  const fetchFinancialData = React.useCallback(async () => {
    try {
      // 1. [QUERY] Extraction: Fetch Invoices, Payments, and Receipts in parallel
      const [invRes, payRes, receiptRes] = await Promise.all([
        invoiceApi.getInvoices(),
        paymentApi.getPayments(),
        receiptApi.getReceipts(),
      ]);

      // 2. [TRANSFORMATION] Invoice Normalization: Resolves raw database cents into UI decimals [E4]
      if (invRes.data) {
        setInvoices(
          invRes.data.map((i: any) => ({
            ...i,
            id: String(i.id || i.invoice_id),
            leaseId: i.leaseId ? String(i.leaseId) : undefined,
            tenantId: i.tenantId ? String(i.tenantId) : undefined,
            unitId: i.unitId ? String(i.unitId) : undefined,
            amount: toLKRFromCents(i.amount),
            amountPaid: toLKRFromCents(i.amountPaid || 0),
            dueDate: i.dueDate
              ? new Date(i.dueDate).toLocaleDateString('en-CA')
              : '',
            generatedDate: i.createdAt
              ? new Date(i.createdAt).toLocaleDateString('en-CA')
              : '',
          }))
        );
      }

      // 3. [TRANSFORMATION] Payment Normalization: resolve submission dates and amounts
      if (payRes.data) {
        setPayments(
          payRes.data.map((p: any) => ({
            ...p,
            id: String(p.id || p.payment_id),
            invoiceId: p.invoiceId ? String(p.invoiceId) : undefined,
            tenantId: p.tenantId ? String(p.tenantId) : undefined,
            amount: toLKRFromCents(p.amount),
            paymentDate: (p.paymentDate || '').split('T')[0],
            submittedAt: p.createdAt || '',
            proofUrl: p.proofUrl,
          }))
        );
      }

      // 4. [TRANSFORMATION] Receipt Normalization: link finalized proofs to UI models
      if (receiptRes.data) {
        setReceipts(
          receiptRes.data.map((r: any) => ({
            ...r,
            id: String(r.id || r.receipt_id),
            paymentId: r.paymentId ? String(r.paymentId) : undefined,
            invoiceId: r.invoiceId ? String(r.invoiceId) : undefined,
            tenantId: r.tenantId ? String(r.tenantId) : undefined,
            amount: toLKRFromCents(r.amount),
            generatedDate: r.receiptDate || r.createdAt,
            paymentDate: (r.paymentDate || '').split('T')[0] || r.receiptDate,
          }))
        );
      }
    } catch (e) {
      console.error('Failed to fetch financial data', e);
    }
  }, []);

  // INITIALIZATION EFFECT: Refresh financial state on identity change.
  useEffect(() => {
    if (user) enqueueFetch(fetchFinancialData);
  }, [user]);

  // FETCH LEDGER SUMMARY: Aggregates portfolio-wide financial performance for reporting.
  const fetchLedgerSummary = async (year: number): Promise<LedgerSummary> => {
    // 1. [API] Extraction
    const { data } = await apiClient.get(
      `/reports/ledger-summary?year=${year}`
    );
    // 2. [TRANSFORMATION] Normalization: Convert reporting-level sums from cents to display LKR
    return {
      totalRevenue: toLKRFromCents(data.totalRevenue),
      totalLiabilityHeld: toLKRFromCents(data.totalLiabilityHeld),
      totalLiabilityRefunded: toLKRFromCents(data.totalLiabilityRefunded),
      netLiability: toLKRFromCents(data.netLiability),
      totalExpense: toLKRFromCents(data.totalExpense),
      netOperatingIncome: toLKRFromCents(data.netOperatingIncome),
    };
  };

  // GENERATE MONTHLY INVOICES: Manual trigger for the automated billing cycle.
  const generateMonthlyInvoices = async () => {
    try {
      // 1. [API] Execution
      await invoiceApi.generateInvoices();
      // 2. [SYNC] Refresh Ledger
      await fetchFinancialData();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to generate invoices');
    }
  };

  // SUBMIT PAYMENT: Handles payment proof uploads with currency normalization and idempotency.
  const submitPayment = async (
    payment: Omit<Payment, 'id' | 'submittedAt'> | FormData,
    idempotencyKey?: string
  ) => {
    try {
      // 1. [SECURITY] Idempotency: prevent double-clicks from double-charging or duplicate entries
      const headers: any = {};
      if (idempotencyKey) {
        headers['X-Idempotency-Key'] = idempotencyKey;
      }

      let res;
      if (payment instanceof FormData) {
        // 2. [TRANSFORMATION] Multipart Conversion: Manually patch decimal LKR to integer Cents for storage
        const amount = payment.get('amount');
        if (amount) {
          payment.set('amount', toCentsFromLKR(Number(amount)).toString());
        }
        res = await paymentApi.submitPayment(payment, headers);
      } else {
        // 3. [TRANSFORMATION] Object Conversion: Convert LKR buffer to storage-side cents [E4]
        res = await paymentApi.submitPayment(
          { ...payment, amount: toCentsFromLKR(payment.amount) },
          headers
        );
      }

      if (res.status === 201) {
        toast.success('Payment submitted successfully');
        await fetchFinancialData();
      }
    } catch (e: any) {
      if (e.response?.status === 409) {
        toast.warning('This payment is already being processed.');
      } else {
        toast.error(e.response?.data?.error || 'Failed to submit payment');
      }
    }
  };

  // VERIFY PAYMENT: Admin workflow to approve bank slips and trigger receipt generation.
  const verifyPayment = async (id: string, approved: boolean) => {
    try {
      const status = approved ? 'verified' : 'rejected';
      // 1. [API] Status Update
      await paymentApi.verifyPayment(id, status);
      // 2. [UI] Feedback
      toast.success(`Payment ${status}`);
      // 3. [SYNC] Refresh Ledger: backend handles receipts automatically on verification
      await fetchFinancialData();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to verify payment');
    }
  };

  // RUN LATE FEE AUDIT: Scans for overdue liabilities and appends automated fines.
  const runLateFeeAudit = async () => {
    try {
      const { adminApi } = await import('../../services/api');
      // 1. [API] Execution
      await adminApi.triggerLateFees();
      toast.success('Late fee audit completed');
      // 2. [SYNC] Refresh state
      await fetchFinancialData();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to run late fee audit');
    }
  };

  return (
    <FinancialContext.Provider
      value={{
        invoices,
        payments,
        receipts,
        fetchLedgerSummary,
        generateMonthlyInvoices,
        submitPayment,
        verifyPayment,
        runLateFeeAudit,
        refreshData: fetchFinancialData,
      }}
    >
      {children}
    </FinancialContext.Provider>
  );
}

export function useFinancial() {
  const context = useContext(FinancialContext);
  if (context === undefined)
    throw new Error('useFinancial must be used within a FinancialProvider');
  return context;
}
