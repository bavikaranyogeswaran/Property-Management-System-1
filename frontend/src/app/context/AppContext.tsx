import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient from '../../services/api';
import { toast } from 'sonner';

// Type definitions
export interface Property {
  id: string;
  name: string;
  propertyTypeId: number;
  typeName?: string;
  addressLine1: string;
  addressLine2?: string;
  addressLine3?: string;
  createdAt: string;
  image?: string;
}

export interface PropertyType {
  type_id: number;
  name: string;
  description: string;
}

export interface UnitType {
  type_id: number;
  name: string;
  description?: string;
}

export interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  unitTypeId: number;       // FK to unit_types
  type: string;             // Type name for display (legacy/computed)
  monthlyRent: number;
  status: 'available' | 'occupied' | 'maintenance';
  createdAt: string;
  image?: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  interestedUnit: string;
  propertyId: string; // Added for correct linkage
  status: 'interested' | 'negotiation' | 'converted' | 'dropped';
  createdAt: string;
  notes: string;
  lastContactedAt?: string;
  score?: number;
}

export interface LeadFollowUp {
  id: string;
  leadId: string;
  date: string;
  notes: string;
  nextAction: string;
}

export interface LeadStageHistory {
  id: string;
  leadId: string;
  fromStatus: Lead['status'] | null;
  toStatus: Lead['status'];
  changedAt: string;
  notes?: string;
  durationInPreviousStage?: number; // days spent in previous stage
}

export interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string;
  leaseId?: string;
  createdAt: string;
}

export interface Treasurer {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string; // For login purposes
  createdAt: string;
  status: 'active' | 'inactive';
}

export interface Lease {
  id: string;
  tenantId: string;
  unitId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  status: 'active' | 'ended' | 'terminated';
  createdAt: string;
}

export interface RentInvoice {
  id: string;
  leaseId: string;
  tenantId: string;
  unitId: string;
  amount: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
  generatedDate: string;
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
}

export interface MaintenanceRequest {
  id: string;
  tenantId: string;
  unitId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'submitted' | 'in_progress' | 'completed' | 'cancelled';
  submittedDate: string;
  completedDate?: string;
  images?: string[];
}

export interface MaintenanceCost {
  id: string;
  requestId: string;
  amount: number;
  description: string;
  recordedDate: string;
}

export interface Notification {
  id: string;
  type: 'lease_expiring' | 'lease_expired' | 'invoice_overdue' | 'maintenance_urgent';
  title: string;
  message: string;
  targetRole: 'owner' | 'tenant' | 'both';
  targetUserId?: string; // For tenant-specific notifications
  leaseId?: string;
  unitId?: string;
  severity: 'info' | 'warning' | 'urgent';
  createdAt: string;
  expiresAt?: string; // When lease expires
  daysUntilExpiry?: number;
  read: boolean;
}

interface AppContextType {
  properties: Property[];
  propertyTypes: PropertyType[];
  unitTypes: UnitType[];
  units: Unit[];
  leads: Lead[];
  leadFollowUps: LeadFollowUp[];
  leadStageHistory: LeadStageHistory[];
  tenants: Tenant[];
  treasurers: Treasurer[];
  leases: Lease[];
  invoices: RentInvoice[];
  payments: Payment[];
  receipts: Receipt[];
  maintenanceRequests: MaintenanceRequest[];
  maintenanceCosts: MaintenanceCost[];
  notifications: Notification[];

  // Property operations
  addProperty: (property: Omit<Property, 'id' | 'createdAt'>) => Promise<Property | undefined>;
  updateProperty: (id: string, property: Partial<Property>) => Promise<void>;
  deleteProperty: (id: string) => Promise<void>;
  uploadPropertyImages: (propertyId: string, files: File[]) => Promise<any>;
  getPropertyImages: (propertyId: string) => Promise<any[]>;
  setPropertyPrimaryImage: (propertyId: string, imageId: string) => Promise<void>;
  deletePropertyImage: (propertyId: string, imageId: string) => Promise<void>;

  // Type operations
  addPropertyType: (type: Omit<PropertyType, 'type_id'>) => Promise<void>;
  deletePropertyType: (id: number) => Promise<void>;
  addUnitType: (type: Omit<UnitType, 'type_id'>) => Promise<void>;
  deleteUnitType: (id: number) => Promise<void>;

  // Unit operations
  addUnit: (unit: Omit<Unit, 'id' | 'createdAt'>) => Promise<Unit | undefined>;
  updateUnit: (id: string, unit: Partial<Unit>) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;
  uploadUnitImages: (unitId: string, files: File[]) => Promise<any>;
  getUnitImages: (unitId: string) => Promise<any[]>;

  // Lead operations
  addLead: (lead: Omit<Lead, 'id' | 'createdAt'> & { password?: string }) => Promise<void>;
  updateLead: (id: string, lead: Partial<Lead>) => Promise<void>;
  addLeadFollowUp: (followUp: Omit<LeadFollowUp, 'id'>) => void;
  convertLeadToTenant: (leadId: string) => Promise<string>;

  // Tenant operations
  addTenant: (tenant: Omit<Tenant, 'id' | 'createdAt'>) => void;

  // Treasurer operations
  addTreasurer: (treasurer: Omit<Treasurer, 'id' | 'createdAt'> & { id?: string }) => void;
  updateTreasurer: (id: string, treasurer: Partial<Treasurer>) => void;
  deleteTreasurer: (id: string) => void;

  // Lease operations
  addLease: (lease: Omit<Lease, 'id' | 'createdAt'>) => void;
  endLease: (id: string) => void;

  // Invoice operations
  generateMonthlyInvoices: () => void;

  // Payment operations
  submitPayment: (payment: Omit<Payment, 'id' | 'submittedAt'>) => void;
  verifyPayment: (id: string, approved: boolean) => void;

  // Maintenance operations
  addMaintenanceRequest: (request: Omit<MaintenanceRequest, 'id' | 'submittedDate'>) => void;
  updateMaintenanceRequest: (id: string, request: Partial<MaintenanceRequest>) => void;
  addMaintenanceCost: (cost: Omit<MaintenanceCost, 'id' | 'recordedDate'>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Initialize with mock data
const INITIAL_DATA = {
  properties: [
    {
      id: 'prop-1',
      name: 'Sunset Apartments',
      addressLine1: '123 Main Street',
      addressLine2: 'Downtown',
      propertyTypeId: 1,
      typeName: 'Apartment Building',
      createdAt: '2024-01-15',
    },
    {
      id: 'prop-2',
      name: 'Commercial Plaza',
      addressLine1: '456 Business Ave',
      addressLine2: 'City Center',
      propertyTypeId: 2,
      typeName: 'Commercial Building',
      createdAt: '2024-02-20',
    },
  ],
  units: [
    {
      id: 'unit-1',
      propertyId: 'prop-1',
      unitNumber: 'A101',
      unitTypeId: 1,
      type: 'Studio',
      monthlyRent: 1200,
      status: 'occupied' as const,
      createdAt: '2024-01-15',
    },
    {
      id: 'unit-2',
      propertyId: 'prop-1',
      unitNumber: 'A102',
      unitTypeId: 2,
      type: '1 Bedroom',
      monthlyRent: 1500,
      status: 'available' as const,
      createdAt: '2024-01-15',
    },
    {
      id: 'unit-3',
      propertyId: 'prop-1',
      unitNumber: 'A103',
      unitTypeId: 3,
      type: '2 Bedroom',
      monthlyRent: 2000,
      status: 'occupied' as const,
      createdAt: '2024-01-15',
    },
  ],
  leads: [
    {
      id: 'lead-1',
      name: 'Alice Johnson',
      email: 'alice@email.com',
      phone: '+94 77 123 4567',
      interestedUnit: 'unit-2',
      propertyId: 'prop-1',
      status: 'interested' as const,
      createdAt: '2025-01-05',
      notes: 'Interested in viewing next week',
      lastContactedAt: '2025-01-05',
      score: 75,
    },
    {
      id: 'lead-2',
      name: 'David Martinez',
      email: 'david@email.com',
      phone: '+94 77 123 4568',
      interestedUnit: 'unit-2',
      propertyId: 'prop-1',
      status: 'negotiation' as const,
      createdAt: '2024-12-20',
      notes: 'Ready to sign lease, discussing move-in date',
      lastContactedAt: '2026-01-10',
      score: 90,
    },
    {
      id: 'lead-3',
      name: 'Emma Wilson',
      email: 'emma@email.com',
      phone: '+94 77 123 4569',
      interestedUnit: 'unit-3',
      propertyId: 'prop-1',
      status: 'dropped' as const,
      createdAt: '2025-01-01',
      notes: 'Found another place',
      lastContactedAt: '2025-01-08',
    },
  ],
  leadFollowUps: [
    {
      id: 'followup-1',
      leadId: 'lead-1',
      date: '2025-01-05',
      notes: 'Initial contact made, sent property details',
      nextAction: 'Schedule viewing',
    },
    {
      id: 'followup-2',
      leadId: 'lead-2',
      date: '2025-01-10',
      notes: 'Discussed lease terms, tenant agreed to monthly rent',
      nextAction: 'Prepare lease agreement',
    },
  ],
  leadStageHistory: [
    {
      id: 'history-1',
      leadId: 'lead-1',
      fromStatus: null,
      toStatus: 'interested' as const,
      changedAt: '2025-01-05T10:00:00Z',
    },
    {
      id: 'history-2',
      leadId: 'lead-2',
      fromStatus: null,
      toStatus: 'interested' as const,
      changedAt: '2024-12-20T09:00:00Z',
    },
    {
      id: 'history-3',
      leadId: 'lead-2',
      fromStatus: 'interested' as const,
      toStatus: 'negotiation' as const,
      changedAt: '2025-01-08T14:30:00Z',
      durationInPreviousStage: 19,
      notes: 'Viewing completed, tenant interested in proceeding',
    },
    {
      id: 'history-4',
      leadId: 'lead-3',
      fromStatus: null,
      toStatus: 'interested' as const,
      changedAt: '2025-01-01T11:00:00Z',
    },
    {
      id: 'history-5',
      leadId: 'lead-3',
      fromStatus: 'interested' as const,
      toStatus: 'dropped' as const,
      changedAt: '2025-01-08T16:00:00Z',
      durationInPreviousStage: 7,
      notes: 'Lead found alternative accommodation',
    },
  ],
  tenants: [
    {
      id: 'tenant-1',
      name: 'Bob Tenant',
      email: 'tenant@pms.com',
      phone: '+94 77 123 4570',
      leaseId: 'lease-1',
      createdAt: '2024-06-01',
    },
    {
      id: 'tenant-2',
      name: 'Carol Smith',
      email: 'carol@email.com',
      phone: '+94 77 123 4571',
      leaseId: 'lease-2',
      createdAt: '2024-07-01',
    },
  ],
  treasurers: [
    {
      id: 'treasurer-1',
      name: 'John Doe',
      email: 'john.doe@pms.com',
      phone: '+94 77 123 4572',
      password: 'securepassword123', // For login purposes
      createdAt: '2024-01-15',
      status: 'active' as const,
    },
    {
      id: 'treasurer-2',
      name: 'Jane Smith',
      email: 'jane.smith@pms.com',
      phone: '+94 77 123 4573',
      password: 'securepassword456', // For login purposes
      createdAt: '2024-02-20',
      status: 'active' as const,
    },
  ],
  leases: [
    {
      id: 'lease-1',
      tenantId: 'tenant-1',
      unitId: 'unit-1',
      startDate: '2024-06-01',
      endDate: '2026-02-15', // Expiring in about 28 days from today (2026-01-18)
      monthlyRent: 1200,
      status: 'active' as const,
      createdAt: '2024-06-01',
    },
    {
      id: 'lease-2',
      tenantId: 'tenant-2',
      unitId: 'unit-3',
      startDate: '2024-07-01',
      endDate: '2026-01-25', // Expiring in 7 days from today (2026-01-18)
      monthlyRent: 2000,
      status: 'active' as const,
      createdAt: '2024-07-01',
    },
  ],
  invoices: [
    {
      id: 'inv-1',
      leaseId: 'lease-1',
      tenantId: 'tenant-1',
      unitId: 'unit-1',
      amount: 1200,
      dueDate: '2026-01-05',
      status: 'pending' as const,
      generatedDate: '2025-12-28',
    },
    {
      id: 'inv-2',
      leaseId: 'lease-2',
      tenantId: 'tenant-2',
      unitId: 'unit-3',
      amount: 2000,
      dueDate: '2026-01-05',
      status: 'paid' as const,
      generatedDate: '2025-12-28',
    },
  ],
  payments: [
    {
      id: 'pay-1',
      invoiceId: 'inv-2',
      tenantId: 'tenant-2',
      amount: 2000,
      paymentDate: '2026-01-03',
      paymentMethod: 'Bank Transfer',
      referenceNumber: 'BT-2026-001',
      status: 'verified' as const,
      submittedAt: '2026-01-03',
    },
  ],
  receipts: [
    {
      id: 'rec-1',
      paymentId: 'pay-1',
      invoiceId: 'inv-2',
      tenantId: 'tenant-2',
      amount: 2000,
      generatedDate: '2026-01-04',
      receiptNumber: 'REC-2026-001',
    },
  ],
  maintenanceRequests: [
    {
      id: 'maint-1',
      tenantId: 'tenant-1',
      unitId: 'unit-1',
      title: 'Leaking faucet',
      description: 'Kitchen faucet is dripping continuously',
      priority: 'medium' as const,
      status: 'submitted' as const,
      submittedDate: '2026-01-08',
    },
  ],
  maintenanceCosts: [],
  notifications: [],
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadFollowUps, setLeadFollowUps] = useState<LeadFollowUp[]>([]);
  const [leadStageHistory, setLeadStageHistory] = useState<LeadStageHistory[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [treasurers, setTreasurers] = useState<Treasurer[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [invoices, setInvoices] = useState<RentInvoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [maintenanceCosts, setMaintenanceCosts] = useState<MaintenanceCost[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Load data from localStorage or use initial data
  useEffect(() => {
    const stored = localStorage.getItem('pms_data');
    const version = localStorage.getItem('pms_version');
    const CURRENT_VERSION = '2.0'; // Updated version for FR-16 implementation

    // If version mismatch, clear old data
    if (version !== CURRENT_VERSION) {
      localStorage.removeItem('pms_data');
      localStorage.setItem('pms_version', CURRENT_VERSION);
    }

    if (stored && version === CURRENT_VERSION) {
      const data = JSON.parse(stored);
      setProperties(data.properties || []);
      setUnits(data.units || []);
      setLeads(data.leads || []);
      setLeadFollowUps(data.leadFollowUps || []);
      setLeadStageHistory(data.leadStageHistory || []);
      setTenants(data.tenants || []);
      setTreasurers(data.treasurers || []);
      setLeases(data.leases || []);
      setInvoices(data.invoices || []);
      setPayments(data.payments || []);
      setReceipts(data.receipts || []);
      setMaintenanceRequests(data.maintenanceRequests || []);
      setMaintenanceCosts(data.maintenanceCosts || []);
      setNotifications(data.notifications || []);

      // Migration: If leadStageHistory is missing but we have leads, create initial history
      if (!data.leadStageHistory && data.leads && data.leads.length > 0) {
        const initialHistory: LeadStageHistory[] = data.leads.map((lead: Lead) => ({
          id: `history-migration-${lead.id}`,
          leadId: lead.id,
          fromStatus: null,
          toStatus: lead.status,
          changedAt: lead.createdAt + 'T10:00:00Z',
        }));
        setLeadStageHistory(initialHistory);
      }
    } else {
      setProperties(INITIAL_DATA.properties);
      setUnits(INITIAL_DATA.units);
      setLeads(INITIAL_DATA.leads);
      setLeadFollowUps(INITIAL_DATA.leadFollowUps);
      setLeadStageHistory(INITIAL_DATA.leadStageHistory);
      setTenants(INITIAL_DATA.tenants);
      setTreasurers(INITIAL_DATA.treasurers);
      setLeases(INITIAL_DATA.leases);
      setInvoices(INITIAL_DATA.invoices);
      setPayments(INITIAL_DATA.payments);
      setReceipts(INITIAL_DATA.receipts);
      setMaintenanceRequests(INITIAL_DATA.maintenanceRequests);
      setMaintenanceCosts(INITIAL_DATA.maintenanceCosts);
      setNotifications(INITIAL_DATA.notifications);
    }

    // Fetch real treasurers from backend (sync with DB)
    const fetchData = async () => {
      try {
        // Fetch Treasurers
        try {
          const trRes = await apiClient.get('/users?role=treasurer');
          if (trRes.data) {
            const mappedTreasurers = trRes.data.map((u: any) => ({
              id: u.user_id.toString(),
              name: u.name,
              email: u.email,
              phone: '',
              password: '',
              createdAt: u.created_at,
              status: u.status
            }));
            setTreasurers(mappedTreasurers);
          }
        } catch (e) { console.error("Failed to fetch treasurers", e); }

        // Fetch Units
        try {
          const uRes = await apiClient.get('/units');
          if (uRes.data) {
            const mappedUnits = uRes.data.map((u: any) => ({
              id: u.id, // unitModel maps it
              propertyId: u.propertyId,
              unitNumber: u.unitNumber,
              unitTypeId: u.unitTypeId,
              type: u.type,
              monthlyRent: u.monthlyRent,
              status: u.status,
              image: u.image,
              createdAt: u.createdAt,
              // propertyName: u.propertyName
            }));
            // Only replace if we got data, to avoid flashing empty if local exists? 
            // Actually we want DB truth.
            setUnits(mappedUnits);
          }
        } catch (e) { console.error("Failed to fetch units", e); }

        // Fetch Properties (if not already fetched via initial props or whatever)
        try {
          const pRes = await apiClient.get('/properties');
          if (pRes.data) {
            const mappedProps = pRes.data.map((p: any) => ({
              id: p.property_id.toString(),
              name: p.name,
              propertyTypeId: p.type_id,
              typeName: p.type_name,
              addressLine1: p.address_line_1,
              addressLine2: p.address_line_2,
              addressLine3: p.address_line_3,
              image: p.image_url,
              createdAt: p.created_at
            }));
            setProperties(mappedProps);
          }
        } catch (e) { console.error("Failed to fetch properties", e); }

      } catch (error) {
        console.error("Failed to fetch initial data", error);
      }
    };

    fetchData();


    // Fetch leads
    const fetchLeads = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (token) {
          const response = await apiClient.get('/leads');
          if (response.status === 200) {
            setLeads(response.data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch leads:', error);
      }
    };
    fetchLeads();

    // Fetch Properties and Types
    const fetchProperties = async () => {
      try {
        const token = localStorage.getItem('authToken');

        // Fetch types (public or protected? assuming public now)
        try {
          const typesResponse = await apiClient.get('/property-types');
          if (typesResponse.status === 200) {
            setPropertyTypes(typesResponse.data);
          }
        } catch (e) {
          console.error("Failed to fetch types", e);
        }

        // Fetch properties (public)
        const response = await apiClient.get('/properties');
        if (response.status === 200) {
          const mappedProps = response.data.map((p: any) => ({
            id: p.property_id.toString(),
            name: p.name,
            propertyTypeId: p.type_id,
            typeName: p.type_name,
            addressLine1: p.address_line_1,
            addressLine2: p.address_line_2,
            addressLine3: p.address_line_3,
            image: p.image_url,
            createdAt: p.created_at
          }));
          setProperties(mappedProps);
        }
      } catch (error) {
        console.error('Failed to fetch properties:', error);
      }
    };
    fetchProperties();

    // Fetch Unit Types
    const fetchUnitTypes = async () => {
      try {
        const response = await apiClient.get('/unit-types');
        if (response.status === 200) {
          setUnitTypes(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch unit types:', error);
      }
    };
    fetchUnitTypes();

  }, []);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    const data = {
      properties,
      propertyTypes,
      units,
      leads,
      leadFollowUps,
      leadStageHistory,
      tenants,
      treasurers,
      leases,
      invoices,
      payments,
      receipts,
      maintenanceRequests,
      maintenanceCosts,
      notifications,
    };
    localStorage.setItem('pms_data', JSON.stringify(data));
  }, [properties, propertyTypes, units, leads, leadFollowUps, leadStageHistory, tenants, treasurers, leases, invoices, payments, receipts, maintenanceRequests, maintenanceCosts, notifications]);

  // Generate lease expiration notifications
  useEffect(() => {
    if (leases.length === 0) return;

    const today = new Date();
    const generatedNotifications: Notification[] = [];

    leases.forEach((lease) => {
      if (lease.status !== 'active') return;

      const endDate = new Date(lease.endDate);
      const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Don't create notifications for leases that already expired
      if (daysUntilExpiry < 0) return;

      // Check if we should notify at these thresholds: 60, 30, 15, 7 days
      const thresholds = [60, 30, 15, 7];
      let shouldNotify = false;
      let severity: 'info' | 'warning' | 'urgent' = 'info';

      if (daysUntilExpiry <= 7) {
        shouldNotify = true;
        severity = 'urgent';
      } else if (daysUntilExpiry <= 15) {
        shouldNotify = true;
        severity = 'urgent';
      } else if (daysUntilExpiry <= 30) {
        shouldNotify = true;
        severity = 'warning';
      } else if (daysUntilExpiry <= 60) {
        shouldNotify = true;
        severity = 'info';
      }

      if (shouldNotify) {
        const unit = units.find(u => u.id === lease.unitId);
        const tenant = tenants.find(t => t.id === lease.tenantId);
        const property = unit ? properties.find(p => p.id === unit.propertyId) : null;

        // Check if notification already exists for this lease and threshold
        const existingNotification = notifications.find(
          n => n.leaseId === lease.id && n.type === 'lease_expiring' && Math.abs((n.daysUntilExpiry || 0) - daysUntilExpiry) < 2
        );

        if (!existingNotification && unit && tenant && property) {
          const message = daysUntilExpiry <= 7
            ? `Lease for ${tenant.name} in ${property.name} Unit ${unit.unitNumber} expires in ${daysUntilExpiry} days on ${lease.endDate}.`
            : daysUntilExpiry <= 15
              ? `Lease expiring in ${daysUntilExpiry} days: ${property.name} Unit ${unit.unitNumber} (${tenant.name}) on ${lease.endDate}.`
              : daysUntilExpiry <= 30
                ? `Lease renewal reminder: ${property.name} Unit ${unit.unitNumber} expires on ${lease.endDate} (${daysUntilExpiry} days).`
                : `Upcoming lease expiration in ${daysUntilExpiry} days for ${property.name} Unit ${unit.unitNumber} on ${lease.endDate}.`;

          generatedNotifications.push({
            id: `notif-${lease.id}-${daysUntilExpiry}`,
            type: 'lease_expiring',
            title: daysUntilExpiry <= 7 ? `⚠️ Urgent: Lease Expiring Soon` : daysUntilExpiry <= 30 ? 'Lease Expiring Soon' : 'Upcoming Lease Expiration',
            message,
            targetRole: 'both',
            targetUserId: tenant.id,
            leaseId: lease.id,
            unitId: lease.unitId,
            severity,
            createdAt: today.toISOString(),
            expiresAt: lease.endDate,
            daysUntilExpiry,
            read: false,
          });
        }
      }
    });

    // Only update notifications if there are new ones to add
    if (generatedNotifications.length > 0) {
      setNotifications(prev => {
        // Remove old notifications for the same leases to avoid duplicates
        const filtered = prev.filter(n =>
          !generatedNotifications.some(gn => gn.leaseId === n.leaseId && n.type === 'lease_expiring')
        );
        return [...filtered, ...generatedNotifications];
      });
    }
  }, [leases, units, tenants, properties]); // Run when leases or related data changes

  // Property operations
  const addProperty = async (property: Omit<Property, 'id' | 'createdAt'>): Promise<Property | undefined> => {
    try {
      const response = await apiClient.post('/properties', {
        ...property,
        imageUrl: property.image // Map frontend 'image' to backend 'imageUrl'
      });
      if (response.status === 201) {
        // Re-fetch or append. Since we need type name etc., might be easier to re-fetch or construct carefully.
        // But we can append what we have + what returned.
        // Actually, backend should return the full object or we fetch.
        // For now, let's just re-fetch or naive append for UI snappiness if valid.
        // But better:
        const newProp = response.data; // Ideally backend returns the created object with ID.
        // But wait, our backend create returns `findById` which includes joins.
        // So we can map it directly.
        const mapped: Property = {
          id: newProp.property_id.toString(),
          name: newProp.name,
          propertyTypeId: newProp.type_id,
          typeName: newProp.type_name,
          addressLine1: newProp.address_line_1,
          addressLine2: newProp.address_line_2,
          addressLine3: newProp.address_line_3,
          image: newProp.image_url,
          createdAt: newProp.created_at
        };
        setProperties([...properties, mapped]);
        return mapped;
      }
    } catch (e) {
      console.error("Failed to add property", e);
      throw e;
    }
  };

  const uploadPropertyImages = async (propertyId: string, files: File[]) => {
    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('images', file);
      });

      const response = await apiClient.post(`/properties/${propertyId}/images`, formData);

      // We might want to update the property's main image if it was the first upload
      if (response.status === 201 && response.data.images && response.data.images.length > 0) {
        const primary = response.data.images.find((img: any) => img.is_primary);
        if (primary) {
          setProperties(prev => prev.map(p => p.id === propertyId ? { ...p, image: primary.image_url } : p));
        }
      }

      return response.data;
    } catch (e) {
      console.error("Failed to upload images", e);
      throw e;
    }
  };

  const setPropertyPrimaryImage = async (propertyId: string, imageId: string) => {
    try {
      await apiClient.put(`/properties/${propertyId}/images/${imageId}/primary`);
      // Note: we'd need to fetch images again or know the URL to update local state perfectly, 
      // but typically we might just re-fetch the property or rely on next page load.
      // For now, let's just return success.
    } catch (e) {
      console.error("Failed to set primary image", e);
      throw e;
    }
  };

  const getPropertyImages = async (propertyId: string) => {
    try {
      const response = await apiClient.get(`/properties/${propertyId}/images`);
      return response.data.images;
    } catch (e) {
      console.error("Failed to fetch property images", e);
      throw e;
    }
  };

  const deletePropertyImage = async (propertyId: string, imageId: string) => {
    try {
      await apiClient.delete(`/properties/images/${imageId}`);
      // If we choose to update local state immediately, we can do it here.
      // Currently properties list only holds primary image.
      // If the deleted image was primary, we should probably refresh properties.
      // But for now, let's just allow the caller to handle state updates if needed, 
      // OR we can refetch properties.
    } catch (e) {
      console.error("Failed to delete property image", e);
      throw e;
    }
  };

  const updateProperty = async (id: string, updates: Partial<Property>) => {
    try {
      await apiClient.put(`/properties/${id}`, {
        ...updates,
        imageUrl: updates.image
      });
      // Optimistic update or re-fetch
      // If we change typeId, we need new typeName.
      if (updates.propertyTypeId) {
        const type = propertyTypes.find(t => t.type_id === updates.propertyTypeId);
        if (type) updates.typeName = type.name;
      }
      setProperties(properties.map(p => p.id === id ? { ...p, ...updates } : p));
    } catch (e) {
      console.error("Failed to update property", e);
      throw e; // Rethrow to let UI handle error state
    }
  };

  const deleteProperty = async (id: string) => {
    try {
      await apiClient.delete(`/properties/${id}`);
      setProperties(properties.filter(p => p.id !== id));
    } catch (e) {
      console.error("Failed to delete property", e);
      throw e;
    }
  };

  // Unit operations
  const addUnit = async (unit: Omit<Unit, 'id' | 'createdAt'>): Promise<Unit | undefined> => {
    try {
      const response = await apiClient.post('/units', {
        ...unit,
        imageUrl: unit.image // Map frontend 'image' to backend 'imageUrl'
      });
      if (response.status === 201) {
        const newUnit: Unit = {
          id: response.data.id,
          propertyId: response.data.propertyId,
          unitNumber: response.data.unitNumber,
          unitTypeId: response.data.unitTypeId,
          type: response.data.type,
          monthlyRent: response.data.monthlyRent,
          status: response.data.status,
          image: response.data.image,
          createdAt: response.data.createdAt,
          // propertyName not in interface but backend returns it
        };
        setUnits([...units, newUnit]);
        return newUnit;
      }
    } catch (e) {
      console.error("Failed to add unit", e);
      throw e;
    }
  };

  const updateUnit = async (id: string, updates: Partial<Unit>) => {
    try {
      const response = await apiClient.put(`/units/${id}`, updates);
      if (response.status === 200) {
        setUnits(units.map(u => u.id === id ? { ...u, ...response.data, id: response.data.id || u.id } : u));
      }
    } catch (e) {
      console.error("Failed to update unit", e);
      throw e;
    }
  };

  const deleteUnit = async (id: string) => {
    try {
      await apiClient.delete(`/units/${id}`);
      setUnits(units.filter(u => u.id !== id));
    } catch (e) {
      console.error("Failed to delete unit", e);
      throw e;
    }
  };

  const uploadUnitImages = async (unitId: string, files: File[]) => {
    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('images', file);
      });

      const response = await apiClient.post(`/units/${unitId}/images`, formData);

      // Update local state if primary image set
      if (response.status === 201 && response.data.images && response.data.images.length > 0) {
        const primary = response.data.images.find((img: any) => img.is_primary) || response.data.images[0];
        if (primary) {
          setUnits(prev => prev.map(u => u.id === unitId ? { ...u, image: primary.image_url } : u));
        }
      }

      return response.data;
    } catch (e) {
      console.error("Failed to upload unit images", e);
      throw e;
    }
  };

  const getUnitImages = async (unitId: string) => {
    try {
      const response = await apiClient.get(`/units/${unitId}/images`);
      return response.data.images;
    } catch (e) {
      console.error("Failed to fetch unit images", e);
      return []; // Return empty array instead of throwing to avoid breaking UI
    }
  };

  // Lead operations
  const addLead = async (lead: Omit<Lead, 'id' | 'createdAt'> & { password?: string }) => {
    try {
      const response = await apiClient.post('/leads', lead);
      if (response.status === 201) {
        const { id } = response.data;
        // Construct the new lead with returned ID
        const newLead: Lead = {
          ...lead,
          id: id.toString(), // Ensure ID is string
          createdAt: new Date().toISOString().split('T')[0],
        };
        setLeads([...leads, newLead]);

        // Record initial stage history
        // Ideally we should fetch this from backend too, or backend creates it and we assume it exists.
        // For UI consistency we add it here locally.
        const initialHistory: LeadStageHistory = {
          id: `history-${Date.now()}`,
          leadId: newLead.id,
          fromStatus: null,
          toStatus: lead.status,
          changedAt: new Date().toISOString(),
        };
        setLeadStageHistory([...leadStageHistory, initialHistory]);
      }
    } catch (error) {
      console.error('Failed to add lead:', error);
      throw error;
    }
  };

  const updateLead = async (id: string, updates: Partial<Lead>) => {
    try {
      await apiClient.put(`/leads/${id}`, updates);

      const currentLead = leads.find(l => l.id === id);

      // If status is changing, record the transition (Local UI update)
      // Backend should ideally handle history creation, but if we keep it in frontend context for now:
      if (currentLead && updates.status && updates.status !== currentLead.status) {
        // Calculate duration in previous stage
        const previousStageHistory = leadStageHistory
          .filter(h => h.leadId === id)
          .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())[0];

        const durationInDays = previousStageHistory
          ? Math.floor((new Date().getTime() - new Date(previousStageHistory.changedAt).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        const historyEntry: LeadStageHistory = {
          id: `history-${Date.now()}`,
          leadId: id,
          fromStatus: currentLead.status,
          toStatus: updates.status,
          changedAt: new Date().toISOString(),
          durationInPreviousStage: durationInDays,
        };

        setLeadStageHistory([...leadStageHistory, historyEntry]);
      }

      setLeads(leads.map(l => l.id === id ? { ...l, ...updates } : l));
    } catch (error) {
      console.error('Failed to update lead:', error);
    }
  };

  const addLeadFollowUp = (followUp: Omit<LeadFollowUp, 'id'>) => {
    const newFollowUp: LeadFollowUp = {
      ...followUp,
      id: `followup-${Date.now()}`,
    };
    setLeadFollowUps([...leadFollowUps, newFollowUp]);
  };

  const convertLeadToTenant = async (leadId: string): Promise<string> => {
    try {
      const response = await apiClient.post(`/leads/${leadId}/convert`, {});
      const { tenantId } = response.data;

      // Optimistic update or refetch?
      // Let's optimistic update for now
      const lead = leads.find(l => l.id === leadId);
      if (lead) {
        updateLead(leadId, { status: 'converted' });

        // Fetch the new tenant details
        try {
          const userResponse = await apiClient.get(`/users/${tenantId}`);
          if (userResponse.status === 200) {
            const newUser = userResponse.data;
            // Add to tenants list
            const newTenant: Tenant = {
              id: newUser.user_id.toString(),
              name: newUser.name,
              email: newUser.email,
              phone: newUser.phone || '',
              createdAt: newUser.created_at.split('T')[0],
              // leaseId is undefined initially
            };
            setTenants(prev => [...prev, newTenant]);
          }
        } catch (fetchError) {
          console.error("Failed to fetch new tenant details:", fetchError);
        }
      }
      return tenantId;
    } catch (error) {
      console.error("Failed to convert lead:", error);
      throw error;
    }
  };

  // Tenant operations
  const addTenant = (tenant: Omit<Tenant, 'id' | 'createdAt'>) => {
    const newTenant: Tenant = {
      ...tenant,
      id: `tenant-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setTenants([...tenants, newTenant]);
  };

  // Treasurer operations
  // Treasurer operations
  const addTreasurer = (treasurer: Omit<Treasurer, 'id' | 'createdAt'> & { id?: string }) => {
    const newTreasurer: Treasurer = {
      ...treasurer,
      id: treasurer.id || `treasurer-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setTreasurers(prev => [...prev, newTreasurer]);
  };

  const updateTreasurer = (id: string, updates: Partial<Treasurer>) => {
    setTreasurers(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const deleteTreasurer = (id: string) => {
    setTreasurers(prev => prev.filter(t => t.id !== id));
  };

  // Lease operations
  const addLease = (lease: Omit<Lease, 'id' | 'createdAt'>) => {
    const newLease: Lease = {
      ...lease,
      id: `lease-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setLeases([...leases, newLease]);

    // Update unit status to occupied
    updateUnit(lease.unitId, { status: 'occupied' });

    // Update tenant with lease ID
    setTenants(tenants.map(t => t.id === lease.tenantId ? { ...t, leaseId: newLease.id } : t));
  };

  const endLease = (id: string) => {
    const lease = leases.find(l => l.id === id);
    if (lease) {
      setLeases(leases.map(l => l.id === id ? { ...l, status: 'ended' } : l));
      updateUnit(lease.unitId, { status: 'available' });
    }
  };

  // Invoice operations
  const generateMonthlyInvoices = () => {
    const activeLeases = leases.filter(l => l.status === 'active');
    const newInvoices: RentInvoice[] = [];

    activeLeases.forEach(lease => {
      // Check if invoice for this month already exists
      const currentMonth = new Date().toISOString().slice(0, 7);
      const existingInvoice = invoices.find(
        inv => inv.leaseId === lease.id && inv.generatedDate.startsWith(currentMonth)
      );

      if (!existingInvoice) {
        const dueDate = new Date();
        dueDate.setDate(5); // Due on 5th of the month
        if (dueDate < new Date()) {
          dueDate.setMonth(dueDate.getMonth() + 1);
        }

        newInvoices.push({
          id: `inv-${Date.now()}-${lease.id}`,
          leaseId: lease.id,
          tenantId: lease.tenantId,
          unitId: lease.unitId,
          amount: lease.monthlyRent,
          dueDate: dueDate.toISOString().split('T')[0],
          status: 'pending',
          generatedDate: new Date().toISOString().split('T')[0],
        });
      }
    });

    if (newInvoices.length > 0) {
      setInvoices([...invoices, ...newInvoices]);
    }
  };

  // Payment operations
  const submitPayment = (payment: Omit<Payment, 'id' | 'submittedAt'>) => {
    const newPayment: Payment = {
      ...payment,
      id: `pay-${Date.now()}`,
      submittedAt: new Date().toISOString(),
    };
    setPayments([...payments, newPayment]);
  };

  const verifyPayment = (id: string, approved: boolean) => {
    const payment = payments.find(p => p.id === id);
    if (!payment) return;

    if (approved) {
      setPayments(payments.map(p => p.id === id ? { ...p, status: 'verified' } : p));

      // Update invoice status
      setInvoices(invoices.map(inv =>
        inv.id === payment.invoiceId ? { ...inv, status: 'paid' } : inv
      ));

      // Generate receipt
      const newReceipt: Receipt = {
        id: `rec-${Date.now()}`,
        paymentId: id,
        invoiceId: payment.invoiceId,
        tenantId: payment.tenantId,
        amount: payment.amount,
        generatedDate: new Date().toISOString().split('T')[0],
        receiptNumber: `REC-${new Date().getFullYear()}-${String(receipts.length + 1).padStart(3, '0')}`,
      };
      setReceipts([...receipts, newReceipt]);
    } else {
      setPayments(payments.map(p => p.id === id ? { ...p, status: 'rejected' } : p));
    }
  };

  // Maintenance operations
  const addMaintenanceRequest = (request: Omit<MaintenanceRequest, 'id' | 'submittedDate'>) => {
    const newRequest: MaintenanceRequest = {
      ...request,
      id: `maint-${Date.now()}`,
      submittedDate: new Date().toISOString().split('T')[0],
    };
    setMaintenanceRequests([...maintenanceRequests, newRequest]);
  };

  const updateMaintenanceRequest = (id: string, updates: Partial<MaintenanceRequest>) => {
    setMaintenanceRequests(maintenanceRequests.map(m =>
      m.id === id ? { ...m, ...updates } : m
    ));
  };

  const addMaintenanceCost = (cost: Omit<MaintenanceCost, 'id' | 'recordedDate'>) => {
    const newCost: MaintenanceCost = {
      ...cost,
      id: `cost-${Date.now()}`,
      recordedDate: new Date().toISOString().split('T')[0],
    };
    setMaintenanceCosts([...maintenanceCosts, newCost]);
  };

  // Type Management Operations
  const addPropertyType = async (type: Omit<PropertyType, 'type_id'>) => {
    try {
      const response = await apiClient.post('/property-types', type);
      setPropertyTypes([...propertyTypes, response.data]);
      toast.success('Property type added');
    } catch (error) {
      console.error('Failed to add property type:', error);
      // @ts-ignore
      const errMsg = error.response?.data?.error || error.message || 'Failed to add property type';
      toast.error(errMsg);
    }
  };

  const deletePropertyType = async (id: number) => {
    try {
      await apiClient.delete(`/property-types/${id}`);
      setPropertyTypes(prev => prev.filter(t => t.type_id !== id));
      toast.success('Property type deleted');
    } catch (error) {
      console.error('Failed to delete property type:', error);
      toast.error('Failed to delete property type');
    }
  };

  const addUnitType = async (type: Omit<UnitType, 'type_id'>) => {
    try {
      const response = await apiClient.post('/unit-types', type);
      setUnitTypes([...unitTypes, response.data]);
      toast.success('Unit type added');
    } catch (error) {
      console.error('Failed to add unit type:', error);
      toast.error('Failed to add unit type');
    }
  };

  const deleteUnitType = async (id: number) => {
    try {
      await apiClient.delete(`/unit-types/${id}`);
      setUnitTypes(prev => prev.filter(t => t.type_id !== id));
      toast.success('Unit type deleted');
    } catch (error) {
      console.error('Failed to delete unit type:', error);
      toast.error('Failed to delete unit type');
    }
  };

  return (
    <AppContext.Provider value={{
      properties,
      propertyTypes,
      unitTypes,
      units,
      leads,
      leadFollowUps,
      leadStageHistory,
      tenants,
      treasurers,
      leases,
      invoices,
      payments,
      receipts,
      maintenanceRequests,
      maintenanceCosts,
      notifications,
      addProperty,
      updateProperty,
      deleteProperty,
      uploadPropertyImages,
      getPropertyImages,
      setPropertyPrimaryImage,
      deletePropertyImage,

      addUnit,
      updateUnit,
      deleteUnit,
      uploadUnitImages,
      getUnitImages,
      addLead,
      updateLead,
      addLeadFollowUp,
      convertLeadToTenant,
      addTenant,
      addTreasurer,
      updateTreasurer,
      deleteTreasurer,
      addLease,
      endLease,
      generateMonthlyInvoices,
      submitPayment,
      verifyPayment,
      addMaintenanceRequest,
      updateMaintenanceRequest,
      addMaintenanceCost,
      addPropertyType,
      deletePropertyType,
      addUnitType,
      deleteUnitType,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}