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
  image?: string;
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
  status: 'vacant' | 'occupied' | 'maintenance';
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
  status: 'active' | 'expired' | 'terminated';
  createdAt?: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  propertyId?: string;
  unitType?: string;
  status: 'interested' | 'converted' | 'dropped';
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
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
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
  status: 'open' | 'in_progress' | 'completed' | 'closed';
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
  log_id: number;
  tenant_id: number;
  type: 'positive' | 'negative' | 'neutral';
  category: string;
  score_change: number;
  description: string;
  recorded_by: number;
  created_at: string;
}

export interface OwnerPayout {
  payout_id: number;
  owner_id: number;
  amount: number;
  period_start: string;
  period_end: string;
  status: 'pending' | 'processed';
  generated_at: string;
  processed_at?: string;
}

export interface AuditLog {
  log_id: number;
  user_id: number | null;
  action_type: string;
  entity_id: number | null;
  details: string; // JSON string
  ip_address: string;
  created_at: string;
  user_name?: string;
}
