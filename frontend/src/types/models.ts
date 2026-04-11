// TypeScript types for database entities

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'tenant' | 'treasurer';
  createdAt?: string;
}

export interface Property {
  id: string;
  ownerId: string;
  name: string;
  propertyNo: string;
  street: string;
  city: string;
  district: string;
  propertyTypeId: number;
  typeName?: string;
  totalUnits: number;
  imageUrl?: string;
  managementFeePercentage?: number;
  createdAt?: string;
}

export interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  type: string;
  bedrooms: number;
  bathrooms: number;
  rent: number;
  status: 'available' | 'occupied' | 'maintenance';
  imageUrl?: string;
  createdAt?: string;
}

export interface Tenant {
  id: string;
  userId?: string; // Optional as it might be redundant with id in some views
  name: string;
  email: string;
  phone: string;
  nic?: string;
  permanentAddress?: string;
  employerName?: string;
  monthlyIncome?: number;
  moveInDate?: string;
  behaviorScore?: number;
  createdAt?: string;
}

export interface Lease {
  id: string;
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  status: 'draft' | 'active' | 'expired' | 'ended' | 'cancelled';
  targetDeposit: number;
  currentDepositBalance: number;
  depositStatus:
    | 'pending'
    | 'paid'
    | 'awaiting_approval'
    | 'awaiting_acknowledgment'
    | 'disputed'
    | 'partially_refunded'
    | 'refunded';
  unitNumber?: string;
  propertyName?: string;
  tenantName?: string;
  createdAt?: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  propertyId?: string;
  unitType?: string;
  status: 'interested' | 'viewed' | 'converted' | 'dropped';
  source: string;
  notes?: string;
  createdAt?: string;
}

export interface Payment {
  id: string;
  leaseId: string;
  tenantId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  status: 'pending' | 'verified' | 'rejected';
  receiptUrl?: string;
  verifiedBy?: string;
  createdAt?: string;
}

export interface Invoice {
  id: string;
  leaseId: string;
  tenantId: string;
  amount: number;
  amountPaid?: number;
  dueDate: string;
  status: 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'void';
  description: string;
  createdAt?: string;
}

export interface MaintenanceRequest {
  id: string;
  unitId: string;
  tenantId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'submitted' | 'in_progress' | 'completed';
  createdAt?: string;
  closedAt?: string;
}

export interface Treasurer {
  id: string;
  userId: string;
  name: string;
  email: string;
  assignedBy: string;
  createdAt?: string;
}

export interface BehaviorLog {
  id: string;
  tenantId: string;
  type: 'positive' | 'negative' | 'neutral';
  category: string;
  scoreChange: number;
  description: string;
  recordedBy: string;
  createdAt: string;
}

export interface OwnerPayout {
  id: string;
  ownerId: string;
  grossAmount: number;
  commissionAmount: number;
  expensesAmount: number;
  amount: number;
  periodStart: string;
  periodEnd: string;
  status: 'pending' | 'paid' | 'acknowledged' | 'disputed';
  bankReference?: string;
  proofUrl?: string;
  treasurerId?: string;
  generatedAt: string;
  processedAt?: string;
  acknowledgedAt?: string;
  disputeReason?: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  actionType: string;
  entityId: string | null;
  details: string; // JSON string
  ipAddress: string;
  createdAt: string;
  userName?: string;
}
