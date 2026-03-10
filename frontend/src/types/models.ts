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
    address: string;
    type: string;
    totalUnits: number;
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
    userId: string;
    name: string;
    email: string;
    phone: string;
    moveInDate?: string;
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
    status: 'new' | 'contacted' | 'viewing_scheduled' | 'converted' | 'lost';
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
