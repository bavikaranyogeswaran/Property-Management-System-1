import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient, { invoiceApi, paymentApi, receiptApi } from '../../services/api';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

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
  submitPayment: (payment: Omit<Payment, 'id' | 'submittedAt'>) => Promise<void>;
  verifyPayment: (id: string, approved: boolean) => Promise<void>;
  recordCashPayment: (invoiceId: string, amount: number, paymentDate: string, referenceNumber?: string) => Promise<void>;
  runLateFeeAudit: () => Promise<void>;
}

const FinancialContext = createContext<FinancialContextType | undefined>(undefined);

export function FinancialProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<RentInvoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  const fetchFinancialData = async () => {
    try {
      // Invoices
      const invRes = await invoiceApi.getInvoices();
      if (invRes.data) {
        setInvoices(invRes.data.map((i: any) => ({
          ...i,
          dueDate: i.dueDate ? new Date(i.dueDate).toLocaleDateString('en-CA') : '',
          generatedDate: i.createdAt ? new Date(i.createdAt).toLocaleDateString('en-CA') : '',
        })));
      }

      // Payments
      const payRes = await paymentApi.getPayments();
      if (payRes.data) {
        setPayments(payRes.data.map((p: any) => ({
          ...p,
          paymentDate: (p.paymentDate || '').split('T')[0],
          submittedAt: p.createdAt || '',
          proofUrl: p.receiptUrl,
        })));
      }

      // Receipts
      const receiptRes = await receiptApi.getReceipts();
      if (receiptRes.data) {
        setReceipts(receiptRes.data.map((r: any) => ({
          ...r,
          generatedDate: r.receiptDate || r.createdAt,
          paymentDate: (r.paymentDate || '').split('T')[0] || r.receiptDate,
        })));
      }
    } catch (e) {
      console.error('Failed to fetch financial data', e);
    }
  };

  useEffect(() => {
    if (user) fetchFinancialData();
  }, [user]);

  const fetchLedgerSummary = async (year: number): Promise<LedgerSummary> => {
    const { data } = await apiClient.get(`/reports/ledger-summary?year=${year}`);
    return data;
  };

  const generateMonthlyInvoices = async () => {
    try {
      await invoiceApi.generateInvoices();
      await fetchFinancialData();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to generate invoices');
    }
  };

  const submitPayment = async (payment: Omit<Payment, 'id' | 'submittedAt'>) => {
    try {
      const res = await paymentApi.submitPayment(payment);
      if (res.status === 201) {
        toast.success('Payment submitted successfully');
        await fetchFinancialData();
      }
    } catch (e) {
      toast.error('Failed to submit payment');
    }
  };

  const verifyPayment = async (id: string, approved: boolean) => {
    try {
      const status = approved ? 'verified' : 'rejected';
      await paymentApi.verifyPayment(id, status);
      toast.success(`Payment ${status}`);
      await fetchFinancialData();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to verify payment');
    }
  };

  const recordCashPayment = async (invoiceId: string, amount: number, paymentDate: string, referenceNumber?: string) => {
    try {
      await paymentApi.recordCashPayment(invoiceId, amount, paymentDate, referenceNumber);
      toast.success('Cash payment recorded');
      await fetchFinancialData();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to record cash payment');
    }
  };
  
  const runLateFeeAudit = async () => {
    try {
      const { adminApi } = await import('../../services/api');
      await adminApi.triggerLateFees();
      toast.success('Late fee audit completed');
      await fetchFinancialData();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to run late fee audit');
    }
  };

  return (
    <FinancialContext.Provider value={{ invoices, payments, receipts, fetchLedgerSummary, generateMonthlyInvoices, submitPayment, verifyPayment, recordCashPayment, runLateFeeAudit }}>
      {children}
    </FinancialContext.Provider>
  );
}

export function useFinancial() {
  const context = useContext(FinancialContext);
  if (context === undefined) throw new Error('useFinancial must be used within a FinancialProvider');
  return context;
}
