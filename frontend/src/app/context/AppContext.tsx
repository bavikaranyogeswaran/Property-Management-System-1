import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import authService from '../../services/auth';
import apiClient, {
  maintenanceApi,
  paymentApi,
  invoiceApi,
  notificationApi,
  receiptApi,
} from '../../services/api';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';

// Type definitions
export interface Property {
  id: string;
  name: string;
  propertyTypeId: number;
  typeName?: string;
  propertyNo: string;
  street: string;
  city: string;
  district: string;
  createdAt: string;
  image?: string;
  description?: string;
  features?: string[];
}

// ... (skipping unchanged interfaces)

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
  unitTypeId: number; // FK to unit_types
  type: string; // Type name for display (legacy/computed)
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
  status: 'interested' | 'converted' | 'dropped';
  createdAt: string;
  notes: string;
  internalNotes?: string;              // Owner's private notes about this lead
  lastContactedAt?: string;
  items?: any[];
  tenantId?: string;
  score?: number;
  moveInDate?: string; // New field
  occupantsCount?: number; // New field
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
  status?: string;
  behaviorScore?: number;
  nic?: string;
  monthlyIncome?: number | string;
  employmentStatus?: string;
  permanentAddress?: string;
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
  securityDeposit?: number;
  depositStatus?: 'pending' | 'paid' | 'partially_refunded' | 'refunded';
  refundedAmount?: number;
  documentUrl?: string; // [ADDED]
  createdAt: string;
}

export interface RentInvoice {
  id: string;
  leaseId: string;
  tenantId: string;
  unitId: string;
  amount: number;
  dueDate: string;
  status: 'pending' | 'partially_paid' | 'paid' | 'overdue';
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
  billToTenant?: boolean;
}

export interface Visit {
  visit_id: string;
  property_id: string;
  unit_id: string | null;
  lead_id: string | null;
  visitor_name: string;
  visitor_email: string;
  visitor_phone: string;
  scheduled_date: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  notes: string;
  created_at: string;
  property_name?: string;
  unit_number?: string;
  lead_status?: string;
}

export interface Notification {
  id: string;
  type:
    | 'lease_expiring'
    | 'lease_expired'
    | 'invoice_overdue'
    | 'maintenance_urgent';
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
  markNotificationAsRead: (id: string) => Promise<void>;

  // Property operations
  addProperty: (
    property: Omit<Property, 'id' | 'createdAt'>
  ) => Promise<Property | undefined>;
  updateProperty: (id: string, property: Partial<Property>) => Promise<void>;
  deleteProperty: (id: string) => Promise<void>;
  uploadPropertyImages: (propertyId: string, files: File[]) => Promise<any>;
  getPropertyImages: (propertyId: string) => Promise<any[]>;
  setPropertyPrimaryImage: (
    propertyId: string,
    imageId: string
  ) => Promise<void>;
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
  setUnitPrimaryImage: (unitId: string, imageId: string) => Promise<void>;
  deleteUnitImage: (unitId: string, imageId: string) => Promise<void>;

  // Lead operations
  addLead: (lead: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>;
  updateLead: (id: string, lead: Partial<Lead>) => Promise<void>;

  convertLeadToTenant: (
    leadId: string,
    startDate?: string,
    endDate?: string,
    data?: string | {
      unitId?: string;
      nic?: string;
      permanentAddress?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      monthlyIncome?: string | number;
    }
  ) => Promise<string>;

  // Tenant operations
  addTenant: (tenant: Omit<Tenant, 'id' | 'createdAt'>) => void;

  // Treasurer operations
  addTreasurer: (
    treasurer: Omit<Treasurer, 'id' | 'createdAt'> & { id?: string }
  ) => void;
  updateTreasurer: (id: string, treasurer: Partial<Treasurer>) => void;
  deleteTreasurer: (id: string) => void;

  // Lease operations
  addLease: (lease: Omit<Lease, 'id' | 'createdAt'>) => Promise<void>;
  endLease: (id: string) => void;
  renewLease: (
    id: string,
    newEndDate: string,
    newMonthlyRent?: number
  ) => Promise<void>;
  refundDeposit: (id: string, amount: number) => Promise<void>;
  updateLeaseDocument: (id: string, documentUrl: string) => Promise<void>; // [ADDED]

  // Invoice operations
  generateMonthlyInvoices: () => void;

  // Payment operations
  submitPayment: (payment: Omit<Payment, 'id' | 'submittedAt'>) => void;
  verifyPayment: (id: string, approved: boolean) => void;
  recordCashPayment: (
    invoiceId: string,
    amount: number,
    paymentDate: string,
    referenceNumber?: string
  ) => Promise<void>;

  // Maintenance operations
  addMaintenanceRequest: (
    request: Omit<MaintenanceRequest, 'id' | 'submittedDate'>
  ) => void;
  updateMaintenanceRequest: (
    id: string,
    request: Partial<MaintenanceRequest>
  ) => void;
  addMaintenanceCost: (
    cost: Omit<MaintenanceCost, 'id' | 'recordedDate'>
  ) => void;
  deleteMaintenanceCost: (id: string) => void;
  createMaintenanceInvoice: (
    requestId: string,
    amount: number,
    description: string,
    dueDate?: string
  ) => Promise<void>;

  // Visit operations
  visits: Visit[];
  fetchVisits: () => Promise<void>;
  scheduleVisit: (visitData: any) => Promise<any>;
  updateVisitStatus: (id: string, status: Visit['status']) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const INITIAL_DATA = {
  visits: [],
  properties: [],
  units: [],
  leads: [],

  leadStageHistory: [],
  tenants: [],
  treasurers: [],
  leases: [],
  invoices: [],
  payments: [],
  receipts: [],
  maintenanceRequests: [],
  maintenanceCosts: [],
  notifications: [],
};

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  const [leadStageHistory, setLeadStageHistory] = useState<LeadStageHistory[]>(
    []
  );
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [treasurers, setTreasurers] = useState<Treasurer[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [invoices, setInvoices] = useState<RentInvoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<
    MaintenanceRequest[]
  >([]);
  const [maintenanceCosts, setMaintenanceCosts] = useState<MaintenanceCost[]>(
    []
  );
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Fetch initial data
  // Fetch initial data
  useEffect(() => {
    // Wait for user to be loaded (if we want to be strict) or just run if token exists.
    // Adding 'user' to dependency ensures we re-fetch if user status changes (e.g. login/processed).
    if (!user) {
      // Option: we could skip fetching if no user, but if token exists in storage we might want to try.
      // However, standard flow is: AuthProvider loads user -> user set -> Fetch Data.
      // Let's rely on user being truthy to avoid unauthorized calls (though api interceptor handles token).
      const token = localStorage.getItem('authToken');
      if (!token) return;
    }

    // Fetch real treasurers from backend (sync with DB)
    const fetchData = async () => {
      try {
        console.log('Fetching App Data...');

        // Fetch Treasurers (Only for Owner)
        if (user?.role === 'owner') {
          try {
            const trRes = await apiClient.get('/users/treasurers');
            if (trRes.data) {
              const mappedTreasurers = trRes.data.map((u: any) => ({
                id: (u.id || u.user_id).toString(),
                name: u.name,
                email: u.email,
                phone: u.phone || '',
                password: '',
                createdAt: u.createdAt || u.created_at,
                status: u.status,
              }));
              setTreasurers(mappedTreasurers);
            }
          } catch (e) {
            console.error('Failed to fetch treasurers', e);
          }
        }

        // Fetch Tenants (Owner and Treasurer)
        if (user?.role === 'owner' || user?.role === 'treasurer') {
          try {
            const tRes = await apiClient.get('/users/tenants');
            if (tRes.data) {
              const mappedTenants = tRes.data.map((u: any) => ({
                id: (u.id || u.user_id).toString(),
                name: u.name,
                email: u.email,
                phone: u.phone,
                createdAt: u.createdAt,
                status: u.status,
                nic: u.nic,
                monthlyIncome: u.monthlyIncome,
                employmentStatus: u.employmentStatus,
                permanentAddress: u.permanentAddress
              }));
              setTenants(mappedTenants);
            }
          } catch (e) {
            console.error('Failed to fetch tenants', e);
          }
        }

        // Fetch Units
        try {
          const uRes = await apiClient.get('/units');
          if (uRes.data) {
            const mappedUnits = uRes.data.map((u: any) => ({
              id: u.id,
              propertyId: u.propertyId,
              unitNumber: u.unitNumber,
              unitTypeId: u.unitTypeId,
              type: u.type,
              monthlyRent: u.monthlyRent,
              status: u.status,
              image: u.image,
              createdAt: u.createdAt,
            }));
            setUnits(mappedUnits);
          }
        } catch (e: any) {
          console.error('Failed to fetch units', e);
        }

        // Fetch Leases (Owner, Treasurer, Tenant sees own?)
        // Assuming /leases endpoint handles filtering or we filter here.
        // For now, let's allow fetching and assume backend secures it or returns subset.
        // Actually, for Tenant, they might need their own lease.
        try {
          const lRes = await apiClient.get('/leases');
          if (lRes.data) {
            const mappedLeases = lRes.data.map((l: any) => ({
              ...l,
              id: l.id?.toString() || l.lease_id?.toString(),
              tenantId: l.tenantId?.toString() || l.tenant_id?.toString(),
              unitId: l.unitId?.toString() || l.unit_id?.toString(),
              documentUrl: l.documentUrl || l.document_url,
            }));
            setLeases(mappedLeases);
          }
        } catch (e) {
          console.error('Failed to fetch leases', e);
        }

        // Fetch Maintenance Requests (NEW)
        try {
          const mRes = await maintenanceApi.getRequests();
          if (mRes.data) {
            const mappedRequests = mRes.data.map((r: any) => ({
              id: r.request_id.toString(),
              tenantId: r.tenant_id.toString(),
              unitId: r.unit_id.toString(),
              title: r.title,
              description: r.description,
              priority: r.priority,
              status: r.status,
              submittedDate: r.created_at ? r.created_at.split('T')[0] : '',
              images: r.images,
            }));
            setMaintenanceRequests(mappedRequests);
          }
        } catch (e) {
          console.error('Failed to fetch maintenance requests', e);
        }

        // Fetch Maintenance Costs (NEW)
        if (user?.role === 'owner' || user?.role === 'treasurer') {
          try {
            const mcRes = await maintenanceApi.getCosts('');
            if (mcRes.data) {
              const mappedCosts = mcRes.data.map((c: any) => ({
                id: c.cost_id.toString(),
                requestId: c.request_id.toString(),
                amount: parseFloat(c.amount),
                description: c.description,
                recordedDate: c.recorded_date
                  ? c.recorded_date.split('T')[0]
                  : '',
              }));
              setMaintenanceCosts(mappedCosts);
            }
          } catch (e) {
            console.error('Failed to fetch maintenance costs', e);
          }
        }

        // Fetch Invoices (NEW)
        try {
          const invRes = await invoiceApi.getInvoices();
          if (invRes.data) {
            const mappedInvoices = invRes.data.map((i: any) => ({
              id: i.invoice_id.toString(),
              leaseId: i.lease_id.toString(),
              tenantId: i.tenant_id.toString(),
              unitId: i.unit_id ? i.unit_id.toString() : '',
              amount: parseFloat(i.amount),
              tenantName: i.tenant_name,
              propertyName: i.property_name,
              unitNumber: i.unit_number,
              dueDate: i.due_date
                ? new Date(i.due_date).toLocaleDateString('en-CA')
                : '',
              status: i.status,
              description: i.description,
              generatedDate: i.created_at
                ? new Date(i.created_at).toLocaleDateString('en-CA')
                : '',
            }));
            setInvoices(mappedInvoices);
          }
        } catch (e) {
          console.error('Failed to fetch invoices', e);
        }

        // Fetch Payments (NEW)
        try {
          const payRes = await paymentApi.getPayments();
          if (payRes.data) {
            const mappedPayments = payRes.data.map((p: any) => ({
              id: p.payment_id?.toString() || '', // Safe access
              invoiceId: p.invoice_id?.toString() || '',
              tenantId: p.tenant_id?.toString() || '',
              amount: parseFloat(p.amount),
              paymentDate: p.payment_date ? p.payment_date.split('T')[0] : '',
              paymentMethod: p.payment_method,
              referenceNumber: p.reference_number,
              status: p.status,
              submittedAt: p.created_at || '',
              proofUrl: p.evidence_url,
            }));
            setPayments(mappedPayments);
          }
        } catch (e) {
          console.error('Failed to fetch payments', e);
        }

        // Fetch Receipts (NEW)
        try {
          const receiptRes = await receiptApi.getReceipts();
          if (receiptRes.data) {
            const mappedReceipts = receiptRes.data.map((r: any) => ({
              id: r.id || r.receipt_id?.toString(),
              paymentId: r.paymentId,
              invoiceId: r.invoiceId,
              tenantId: r.tenantId,
              amount:
                typeof r.amount === 'string' ? parseFloat(r.amount) : r.amount,
              generatedDate: r.receiptDate || r.generatedDate || r.createdAt,
              receiptNumber: r.receiptNumber,
              propertyName: r.propertyName,
              unitNumber: r.unitNumber,
              tenantName: r.tenantName,
              tenantEmail: r.tenantEmail,
              paymentMethod: r.paymentMethod,
              paymentDate: r.paymentDate
                ? r.paymentDate.split('T')[0]
                : r.generatedDate,
              description: r.description,
            }));
            setReceipts(mappedReceipts);
          }
        } catch (e) {
          console.error('Failed to fetch receipts', e);
        }

        // Fetch Properties (if not already fetched via initial props or whatever)
        try {
          const pRes = await apiClient.get('/properties');
          if (pRes.data) {
            const mappedProps = pRes.data.map((p: any) => ({
              id: p.id || p.property_id?.toString(),
              name: p.name,
              propertyTypeId: p.propertyTypeId || p.type_id,
              typeName: p.typeName || p.type_name,
              propertyNo: p.propertyNo || p.property_no,
              street: p.street,
              city: p.city,
              district: p.district,
              image: p.image || p.image_url,
              createdAt: p.createdAt || p.created_at,
              description: p.description,
              features: p.features,
            }));
            setProperties(mappedProps);
          }
        } catch (e) {
          console.error('Failed to fetch properties', e);
        }
      } catch (error) {
        console.error('Failed to fetch initial data', error);
      }
    };

    fetchData();

    // Fetch leads
    const fetchLeads = async () => {
      try {
        const currentUser = authService.getCurrentUser();
        // Fallback to prop user if storage is slightly out of sync or just trust prop
        if (user?.role !== 'owner' && currentUser?.role !== 'owner') return;

        const token = localStorage.getItem('authToken');
        if (token) {
          const response = await apiClient.get('/leads');
          if (response.status === 200) {
            const mappedLeads = response.data.map((l: any) => ({
              ...l,
              id: l.id.toString(),
              interestedUnit: l.interestedUnit
                ? l.interestedUnit.toString()
                : undefined,
              propertyId: l.propertyId ? l.propertyId.toString() : undefined,
              tenantId: l.tenantId ? l.tenantId.toString() : undefined,
            }));
            setLeads(mappedLeads);
          }
        }
      } catch (error: any) {
        // Suppress 403 errors if somehow we got here but shouldn't have, or just log them
        if (error.response && error.response.status === 403) {
          return;
        }
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
          console.error('Failed to fetch types', e);
        }

        // Fetch properties (public)
        const response = await apiClient.get('/properties');
        if (response.status === 200) {
          const mappedProps = response.data.map((p: any) => ({
            id: p.id,
            name: p.name,
            propertyTypeId: p.propertyTypeId,
            typeName: p.typeName,
            propertyNo: p.propertyNo || '',
            street: p.street || '',
            city: p.city || '',
            district: p.district || '',
            image: p.image,
            createdAt: p.createdAt,
            description: p.description,
            features: p.features,
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

    // Fetch Lead Stage History
    const fetchLeadStageHistory = async () => {
      try {
        const currentUser = authService.getCurrentUser();
        if (user?.role !== 'owner' && currentUser?.role !== 'owner') return;

        const token = localStorage.getItem('authToken');
        if (token) {
          const response = await apiClient.get('/leads/stage-history');
          if (response.status === 200) {
            console.log('[DEBUG] Fetched Stage History:', response.data);
            setLeadStageHistory(response.data);
          }
        }
      } catch (error: any) {
        if (error.response && error.response.status === 403) {
          return;
        }
        console.error('Failed to fetch lead stage history:', error);
      }
    };
    fetchLeadStageHistory();
  }, [user]); // Re-run when user auth state changes

  // Generate lease expiration notifications
  useEffect(() => {
    if (leases.length === 0) return;

    const today = new Date();
    const generatedNotifications: Notification[] = [];

    leases.forEach((lease) => {
      if (lease.status !== 'active') return;

      const endDate = new Date(lease.endDate);
      const daysUntilExpiry = Math.ceil(
        (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

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
        const unit = units.find((u) => u.id === lease.unitId);
        const tenant = tenants.find((t) => t.id === lease.tenantId);
        const property = unit
          ? properties.find((p) => p.id === unit.propertyId)
          : null;

        // Check if notification already exists for this lease and threshold
        const existingNotification = notifications.find(
          (n) =>
            n.leaseId === lease.id &&
            n.type === 'lease_expiring' &&
            Math.abs((n.daysUntilExpiry || 0) - daysUntilExpiry) < 2
        );

        if (!existingNotification && unit && tenant && property) {
          const message =
            daysUntilExpiry <= 7
              ? `Lease for ${tenant.name} in ${property.name} Unit ${unit.unitNumber} expires in ${daysUntilExpiry} days on ${lease.endDate}.`
              : daysUntilExpiry <= 15
                ? `Lease expiring in ${daysUntilExpiry} days: ${property.name} Unit ${unit.unitNumber} (${tenant.name}) on ${lease.endDate}.`
                : daysUntilExpiry <= 30
                  ? `Lease renewal reminder: ${property.name} Unit ${unit.unitNumber} expires on ${lease.endDate} (${daysUntilExpiry} days).`
                  : `Upcoming lease expiration in ${daysUntilExpiry} days for ${property.name} Unit ${unit.unitNumber} on ${lease.endDate}.`;

          generatedNotifications.push({
            id: `notif-${lease.id}-${daysUntilExpiry}`,
            type: 'lease_expiring',
            title:
              daysUntilExpiry <= 7
                ? `⚠️ Urgent: Lease Expiring Soon`
                : daysUntilExpiry <= 30
                  ? 'Lease Expiring Soon'
                  : 'Upcoming Lease Expiration',
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
      setNotifications((prev) => {
        // Remove old notifications for the same leases to avoid duplicates
        const filtered = prev.filter(
          (n) =>
            !generatedNotifications.some(
              (gn) => gn.leaseId === n.leaseId && n.type === 'lease_expiring'
            )
        );
        return [...filtered, ...generatedNotifications];
      });
    }
  }, [leases, units, tenants, properties]); // Run when leases or related data changes

  // Property operations
  const addProperty = async (
    property: Omit<Property, 'id' | 'createdAt'>
  ): Promise<Property | undefined> => {
    try {
      const response = await apiClient.post('/properties', {
        ...property,
        imageUrl: property.image, // Map frontend 'image' to backend 'imageUrl'
      });
      if (response.status === 201) {
        // Re-fetch or append. Since we need type name etc., might be easier to re-fetch or construct carefully.
        // But we can append what we have + what returned.
        // Actually, backend should return the full object or we fetch.
        // For now, let's just re-fetch or naive append for UI snappiness if valid.
        // But better:
        const newProp = response.data;

        // Backend returns camelCase keys from findById
        const mapped: Property = {
          id: newProp.id, // propertyModel returns .id as string already
          name: newProp.name,
          propertyTypeId: newProp.propertyTypeId,
          typeName: newProp.typeName,
          propertyNo: newProp.propertyNo,
          street: newProp.street,
          city: newProp.city,
          district: newProp.district,
          image: newProp.image,
          createdAt: newProp.createdAt,
          description: newProp.description,
          features: newProp.features,
        };
        setProperties([...properties, mapped]);
        return mapped;
      }
    } catch (e) {
      console.error('Failed to add property', e);
      throw e;
    }
  };

  const uploadPropertyImages = async (propertyId: string, files: File[]) => {
    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('images', file);
      });

      const response = await apiClient.post(
        `/properties/${propertyId}/images`,
        formData
      );

      // We might want to update the property's main image if it was the first upload
      if (
        response.status === 201 &&
        response.data.images &&
        response.data.images.length > 0
      ) {
        const primary = response.data.images.find((img: any) => img.is_primary);
        if (primary) {
          setProperties((prev) =>
            prev.map((p) =>
              p.id === propertyId ? { ...p, image: primary.image_url } : p
            )
          );
        }
      }

      return response.data;
    } catch (e) {
      console.error('Failed to upload images', e);
      throw e;
    }
  };

  const setPropertyPrimaryImage = async (
    propertyId: string,
    imageId: string
  ) => {
    try {
      await apiClient.put(
        `/properties/${propertyId}/images/${imageId}/primary`
      );
      // Note: we'd need to fetch images again or know the URL to update local state perfectly,
      // but typically we might just re-fetch the property or rely on next page load.
      // For now, let's just return success.
    } catch (e) {
      console.error('Failed to set primary image', e);
      throw e;
    }
  };

  const getPropertyImages = async (propertyId: string) => {
    try {
      const response = await apiClient.get(`/properties/${propertyId}/images`);
      return response.data.images;
    } catch (e) {
      console.error('Failed to fetch property images', e);
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
      console.error('Failed to delete property image', e);
      throw e;
    }
  };

  const updateProperty = async (id: string, updates: Partial<Property>) => {
    try {
      await apiClient.put(`/properties/${id}`, {
        ...updates,
        imageUrl: updates.image,
      });
      // Optimistic update or re-fetch
      // If we change typeId, we need new typeName.
      if (updates.propertyTypeId) {
        const type = propertyTypes.find(
          (t) => t.type_id === updates.propertyTypeId
        );
        if (type) updates.typeName = type.name;
      }
      setProperties(
        properties.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    } catch (e) {
      console.error('Failed to update property', e);
      throw e; // Rethrow to let UI handle error state
    }
  };

  const deleteProperty = async (id: string) => {
    try {
      await apiClient.delete(`/properties/${id}`);
      setProperties(properties.filter((p) => p.id !== id));
    } catch (e) {
      console.error('Failed to delete property', e);
      throw e;
    }
  };

  // Unit operations
  const addUnit = async (
    unit: Omit<Unit, 'id' | 'createdAt'>
  ): Promise<Unit | undefined> => {
    try {
      const response = await apiClient.post('/units', {
        ...unit,
        imageUrl: unit.image, // Map frontend 'image' to backend 'imageUrl'
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
      console.error('Failed to add unit', e);
      throw e;
    }
  };

  const updateUnit = async (id: string, updates: Partial<Unit>) => {
    try {
      const response = await apiClient.put(`/units/${id}`, updates);
      if (response.status === 200) {
        setUnits(
          units.map((u) =>
            u.id === id
              ? { ...u, ...response.data, id: response.data.id || u.id }
              : u
          )
        );
      }
    } catch (e) {
      console.error('Failed to update unit', e);
      throw e;
    }
  };

  const deleteUnit = async (id: string) => {
    try {
      await apiClient.delete(`/units/${id}`);
      setUnits(units.filter((u) => u.id !== id));
    } catch (e) {
      console.error('Failed to delete unit', e);
      throw e;
    }
  };

  const uploadUnitImages = async (unitId: string, files: File[]) => {
    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('images', file);
      });

      const response = await apiClient.post(
        `/units/${unitId}/images`,
        formData
      );

      // Update local state if primary image set
      if (
        response.status === 201 &&
        response.data.images &&
        response.data.images.length > 0
      ) {
        const primary =
          response.data.images.find((img: any) => img.is_primary) ||
          response.data.images[0];
        if (primary) {
          setUnits((prev) =>
            prev.map((u) =>
              u.id === unitId ? { ...u, image: primary.image_url } : u
            )
          );
        }
      }

      return response.data;
    } catch (e) {
      console.error('Failed to upload unit images', e);
      throw e;
    }
  };

  const getUnitImages = async (unitId: string) => {
    try {
      const response = await apiClient.get(`/units/${unitId}/images`);
      return response.data.images;
    } catch (e) {
      console.error('Failed to fetch unit images', e);
      return []; // Return empty array instead of throwing to avoid breaking UI
    }
  };

  const setUnitPrimaryImage = async (unitId: string, imageId: string) => {
    try {
      await apiClient.put(`/units/${unitId}/images/${imageId}/primary`);
    } catch (e) {
      console.error('Failed to set primary unit image', e);
      throw e;
    }
  };

  const deleteUnitImage = async (unitId: string, imageId: string) => {
    try {
      await apiClient.delete(`/units/images/${imageId}`);
    } catch (e) {
      console.error('Failed to delete unit image', e);
      throw e;
    }
  };

  // Lead operations
  const addLead = async (lead: Omit<Lead, 'id' | 'createdAt'>) => {
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

      const currentLead = leads.find((l) => l.id === id);

      // If status is changing, record the transition (Local UI update)
      // Backend should ideally handle history creation, but if we keep it in frontend context for now:
      if (
        currentLead &&
        updates.status &&
        updates.status !== currentLead.status
      ) {
        // Calculate duration in previous stage
        const previousStageHistory = leadStageHistory
          .filter((h) => h.leadId === id)
          .sort(
            (a, b) =>
              new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
          )[0];

        const durationInDays = previousStageHistory
          ? Math.floor(
              (new Date().getTime() -
                new Date(previousStageHistory.changedAt).getTime()) /
                (1000 * 60 * 60 * 24)
            )
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

      setLeads(leads.map((l) => (l.id === id ? { ...l, ...updates } : l)));
    } catch (error) {
      console.error('Failed to update lead:', error);
    }
  };



  const convertLeadToTenant = async (
    leadId: string,
    startDate?: string,
    endDate?: string,
    data?: string | any 
  ) => {
    try {
      const payload: any = { startDate, endDate };

      if (typeof data === 'string') {
        payload.unitId = data;
      } else if (data) {
        Object.assign(payload, data);
      }

      const response = await apiClient.post(`/leads/${leadId}/convert`, payload);

      // Since leads, tenants, units, and leases are all affected,
      // and we haven't refactored the fetch functions to be accessible here yet,
      // a full page reload is the safest way to sync everything.
      window.location.reload();

      return response.data.tenantId;
    } catch (error) {
      console.error('Failed to convert lead:', error);
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
  const addTreasurer = (
    treasurer: Omit<Treasurer, 'id' | 'createdAt'> & { id?: string }
  ) => {
    const newTreasurer: Treasurer = {
      ...treasurer,
      id: treasurer.id || `treasurer-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setTreasurers((prev) => [...prev, newTreasurer]);
  };

  const updateTreasurer = (id: string, updates: Partial<Treasurer>) => {
    setTreasurers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  };

  const deleteTreasurer = (id: string) => {
    setTreasurers((prev) => prev.filter((t) => t.id !== id));
  };

  // Lease operations
  const addLease = async (lease: Omit<Lease, 'id' | 'createdAt'>) => {
    try {
      const response = await apiClient.post('/leases', lease);
      const newLease = response.data; // backend should return { id: ... } or full object? Controller returns { id, message }

      // If controller returns { id, message }, we need to construct the object or fetch it.
      // Let's assume we construct it for UI responsiveness
      const constructedLease: Lease = {
        ...lease,
        id: newLease.id,
        createdAt: new Date().toISOString().split('T')[0],
      };

      setLeases([...leases, constructedLease]);
      updateUnit(lease.unitId, { status: 'occupied' });

      // Also update tenant leasing info if needed, but tenant object here is simple.
    } catch (error) {
      console.error('Failed to create lease:', error);
      throw error;
    }
  };

  const endLease = async (id: string) => {
    try {
      await apiClient.put(`/leases/${id}/end`);
      setLeases((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: 'ended' } : l))
      );
      // Update unit status to available
      const lease = leases.find((l) => l.id === id);
      if (lease) {
        updateUnit(lease.unitId, { status: 'available' });
      }
      toast.success('Lease ended successfully');
    } catch (e) {
      console.error('Failed to end lease', e);
      toast.error('Failed to end lease');
    }
  };

  const renewLease = async (
    id: string,
    newEndDate: string,
    newMonthlyRent?: number
  ) => {
    try {
      await apiClient.put(`/leases/${id}/renew`, {
        newEndDate,
        newMonthlyRent,
      });
      // Update local state
      setLeases((prev) =>
        prev.map((l) =>
          l.id === id
            ? {
                ...l,
                endDate: newEndDate,
                monthlyRent: newMonthlyRent || l.monthlyRent,
              }
            : l
        )
      );
      toast.success('Lease renewed successfully');
    } catch (e: any) {
      console.error('Failed to renew lease', e);
      const msg = e.response?.data?.error || 'Failed to renew lease';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const refundDeposit = async (id: string, amount: number) => {
    try {
      await apiClient.post(`/leases/${id}/refund`, { amount });
      // Refetch leases to get updated status
      const lRes = await apiClient.get('/leases');
      setLeases(lRes.data);
      toast.success('Deposit refunded successfully');
    } catch (e: any) {
      console.error('Failed to refund deposit', e);
      const msg = e.response?.data?.error || 'Failed to refund deposit';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const updateLeaseDocument = async (id: string, documentUrl: string) => {
    try {
      await apiClient.patch(`/leases/${id}/document`, { documentUrl });
      // Update local state instead of full refetch for better UX
      setLeases((prev) =>
        prev.map((lease) =>
          lease.id === id ? { ...lease, documentUrl } : lease
        )
      );
      toast.success('Document updated successfully');
    } catch (error: any) {
      console.error('Failed to update lease document', error);
      toast.error(error.response?.data?.error || 'Failed to update document');
      throw error;
    }
  };

  // Invoice operations
  const generateMonthlyInvoices = async () => {
    try {
      // Call backend to generate invoices
      await invoiceApi.generateInvoices();

      // Refresh list
      const res = await invoiceApi.getInvoices();
      if (res.data) {
        // Map data again as in initial fetch?
        // Or just trust the same structure if consistent.
        // Using same mapping logic for safety
        const mappedInvoices = res.data.map((i: any) => ({
          id: i.invoice_id.toString(),
          leaseId: i.lease_id.toString(),
          tenantId: i.tenant_id.toString(),
          unitId: i.unit_id ? i.unit_id.toString() : '',
          amount: parseFloat(i.amount),
          dueDate: i.due_date ? i.due_date.split('T')[0] : '',
          status: i.status,
          description: i.description,
          generatedDate: i.created_at ? i.created_at.split('T')[0] : '',
        }));
        setInvoices(mappedInvoices);
        // toast handled by caller? or here? Caller usually does it but we can do it here too or let caller do it for custom msg.
        // Caller (OwnerInvoicesPage) does toast.success.
      }
    } catch (e: any) {
      console.error('Failed to generate invoices', e);
      // @ts-ignore
      toast.error(e.response?.data?.error || 'Failed to generate invoices');
    }
  };

  // Payment operations
  const submitPayment = async (
    payment: Omit<Payment, 'id' | 'submittedAt'>
  ) => {
    try {
      const res = await paymentApi.submitPayment(payment);
      if (res.status === 201) {
        toast.success('Payment submitted successfully');
        // Refresh payments
        const payRes = await paymentApi.getPayments();
        setPayments(payRes.data);
      }
    } catch (e) {
      console.error('Failed to submit payment', e);
      toast.error('Failed to submit payment');
    }
  };

  const verifyPayment = async (id: string, approved: boolean) => {
    try {
      const status = approved ? 'verified' : 'rejected';
      const res = await paymentApi.verifyPayment(id, status);
      if (res.status === 200) {
        toast.success(`Payment ${status}`);
        // Refresh payments and invoices
        const payRes = await paymentApi.getPayments();
        setPayments(payRes.data);
        const invRes = await invoiceApi.getInvoices();
        setInvoices(invRes.data);
        // Refresh receipts
        try {
          const receiptRes = await receiptApi.getReceipts();
          if (receiptRes.data) {
            const mappedReceipts = receiptRes.data.map((r: any) => ({
              id: r.id || r.receipt_id?.toString(),
              paymentId: r.paymentId,
              invoiceId: r.invoiceId,
              tenantId: r.tenantId,
              amount:
                typeof r.amount === 'string' ? parseFloat(r.amount) : r.amount,
              generatedDate: r.receiptDate || r.generatedDate || r.createdAt,
              receiptNumber: r.receiptNumber,
            }));
            setReceipts(mappedReceipts);
          }
        } catch (e) {
          console.error('Failed to refresh receipts', e);
        }
      }
    } catch (e: any) {
      console.error('Failed to verify payment', e);
      const msg = e.response?.data?.error || 'Failed to verify payment';
      toast.error(msg);
    }
  };

  // Maintenance operations
  // Maintenance operations
  const addMaintenanceRequest = async (
    request: Omit<MaintenanceRequest, 'id' | 'submittedDate'>
  ) => {
    try {
      const res = await maintenanceApi.createRequest(request);
      if (res.status === 201) {
        toast.success('Maintenance request submitted');
        const refreshRes = await maintenanceApi.getRequests();
        setMaintenanceRequests(refreshRes.data);
      }
    } catch (e) {
      console.error('Failed to add maintenance request', e);
      toast.error('Failed to submit request');
    }
  };

  const updateMaintenanceRequest = async (
    id: string,
    updates: Partial<MaintenanceRequest>
  ) => {
    try {
      if (updates.status) {
        await maintenanceApi.updateStatus(id, updates.status);
        toast.success('Status updated');
        // Refresh
        const refreshRes = await maintenanceApi.getRequests();
        setMaintenanceRequests(refreshRes.data);
      }
    } catch (e) {
      console.error('Failed to update status', e);
      toast.error('Failed to update status');
    }
  };

  const recordCashPayment = async (
    invoiceId: string,
    amount: number,
    paymentDate: string,
    referenceNumber?: string
  ) => {
    try {
      await paymentApi.recordCashPayment(
        invoiceId,
        amount,
        paymentDate,
        referenceNumber
      );
      toast.success('Cash payment recorded');
      // Refresh payments and invoices
      const payRes = await paymentApi.getPayments();
      if (payRes.data) {
        const mappedPayments = payRes.data.map((p: any) => ({
          id: p.payment_id.toString(),
          invoiceId: p.invoice_id.toString(),
          tenantId: p.tenant_id.toString(),
          amount: parseFloat(p.amount),
          paymentDate: p.payment_date ? p.payment_date.split('T')[0] : '',
          paymentMethod: p.payment_method,
          referenceNumber: p.reference_number,
          status: p.status,
          submittedAt: p.created_at || '',
          proofUrl: p.evidence_url,
        }));
        setPayments(mappedPayments);
      }
      const invRes = await invoiceApi.getInvoices();
      setInvoices(
        invRes.data.map((i: any) => ({
          id: i.invoice_id.toString(),
          leaseId: i.lease_id,
          tenantId: i.tenant_id,
          unitId: i.unit_id ? i.unit_id.toString() : '',
          amount: parseFloat(i.amount),
          dueDate: i.due_date ? i.due_date.split('T')[0] : '',
          status: i.status,
          generatedDate: i.created_at ? i.created_at.split('T')[0] : '',
        }))
      );
      // Refresh receipts
      try {
        const receiptRes = await receiptApi.getReceipts();
        if (receiptRes.data) {
          const mappedReceipts = receiptRes.data.map((r: any) => ({
            id: r.id || r.receipt_id?.toString(),
            paymentId: r.paymentId,
            invoiceId: r.invoiceId,
            tenantId: r.tenantId,
            amount:
              typeof r.amount === 'string' ? parseFloat(r.amount) : r.amount,
            generatedDate: r.receiptDate || r.generatedDate || r.createdAt,
            receiptNumber: r.receiptNumber,
          }));
          setReceipts(mappedReceipts);
        }
      } catch (e) {
        console.error('Failed to refresh receipts', e);
      }
    } catch (e: any) {
      console.error('Failed to record cash payment', e);
      toast.error(e.response?.data?.error || 'Failed to record cash payment');
    }
  };

  const addMaintenanceCost = async (
    cost: Omit<MaintenanceCost, 'id' | 'recordedDate'>
  ) => {
    try {
      const res = await maintenanceApi.addCost(cost);
      if (res.status === 201) {
        toast.success(
          cost.billToTenant
            ? 'Cost recorded & Invoice generated'
            : 'Cost recorded'
        );
        // Refresh costs
        const mcRes = await maintenanceApi.getCosts('');
        setMaintenanceCosts(mcRes.data);
        // Also refresh requests if total cost affects request display? (Ideally not needed if separate)
      }
    } catch (e) {
      console.error('Failed to record cost', e);
      toast.error('Failed to record cost');
    }
  };

  const deleteMaintenanceCost = async (id: string) => {
    try {
      await maintenanceApi.deleteCost(id);
      toast.success('Cost deleted');
      // Update local state or refresh
      setMaintenanceCosts((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error('Failed to delete cost', e);
      toast.error('Failed to delete cost');
    }
  };

  // Type Management Operations
  const addPropertyType = async (type: Omit<PropertyType, 'type_id'>) => {
    try {
      const response = await apiClient.post('/property-types', type);
      setPropertyTypes([...propertyTypes, response.data]);
      toast.success('Property type added');
    } catch (error: any) {
      console.error('Failed to add property type:', error);
      const errMsg =
        error.response?.data?.error ||
        error.message ||
        'Failed to add property type';
      toast.error(errMsg);
    }
  };

  const deletePropertyType = async (id: number) => {
    try {
      await apiClient.delete(`/property-types/${id}`);
      setPropertyTypes((prev) => prev.filter((t) => t.type_id !== id));
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
      setUnitTypes((prev) => prev.filter((t) => t.type_id !== id));
      toast.success('Unit type deleted');
    } catch (error) {
      console.error('Failed to delete unit type:', error);
      toast.error('Failed to delete unit type');
    }
  };

  const fetchVisits = async () => {
    try {
      // Only fetch if owner? Backend checks role, but handled gracefully
      const response = await apiClient.get('/visits');
      setVisits(response.data);
    } catch (error) {
      console.error('Failed to fetch visits:', error);
    }
  };

  const updateVisitStatus = async (id: string, status: Visit['status']) => {
    try {
      await apiClient.patch(`/visits/${id}/status`, { status });
      setVisits((prev) =>
        prev.map((v) => (v.visit_id === id ? { ...v, status } : v))
      );
      toast.success(`Visit ${status}`);
    } catch (error) {
      console.error('Failed to update visit status:', error);
      toast.error('Failed to update visit status');
    }
  };

  const markNotificationAsRead = async (id: string) => {
    try {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      if (!id.startsWith('notif-')) {
        await notificationApi.markAsRead(id);
      }
    } catch (e) {
      console.error('Failed to mark notification as read', e);
    }
  };

  // Fetch Notifications from Backend
  // Fetch Notifications from Backend
  useEffect(() => {
    const fetchNotifications = async () => {
      // Don't fetch if not logged in
      if (!user) return;

      try {
        const res = await notificationApi.getNotifications();
        if (res.data) {
          const backendNotifs = res.data.map((n: any) => ({
            id: n.notification_id.toString(),
            type: n.type,
            title:
              n.type === 'maintenance' ? 'Maintenance Update' : 'Notification',
            message: n.message,
            targetRole: 'both', // Backend already filtered by user, so 'both' ensures visibility
            severity: 'info',
            createdAt: n.created_at,
            read: Boolean(n.is_read),
          }));
          setNotifications((prev) => {
            // Keep existing local notifications (those starting with 'notif-')
            const local = prev.filter((n) => n.id.startsWith('notif-'));
            return [...local, ...backendNotifs];
          });
        }
      } catch (e) {
        console.error('Failed to fetch notifications', e);
      }
    };
    fetchNotifications();
  }, [user]);

  // Initial fetch for visits if owner
  // Initial fetch for visits if owner
  useEffect(() => {
    // Rely on the user state which is loaded on mount
    if (user && user.role === 'owner') {
      fetchVisits();
    }
  }, [user]);

  const createMaintenanceInvoice = async (
    requestId: string,
    amount: number,
    description: string,
    dueDate?: string
  ) => {
    try {
      await maintenanceApi.createInvoice({
        requestId,
        amount,
        description,
        dueDate,
      });
      // Refresh invoices
      const invRes = await invoiceApi.getInvoices();
      if (invRes.data) {
        const mappedInvoices = invRes.data.map((i: any) => ({
          id: i.invoice_id.toString(),
          leaseId: i.lease_id.toString(),
          tenantId: i.tenant_id.toString(),
          unitId: i.unit_id ? i.unit_id.toString() : '',
          amount: parseFloat(i.amount),
          dueDate: i.due_date ? i.due_date.split('T')[0] : '',
          status: i.status,
          description: i.description,
          generatedDate: i.created_at ? i.created_at.split('T')[0] : '',
        }));
        setInvoices(mappedInvoices);
      }
      toast.success('Maintenance invoice created successfully');
    } catch (e: any) {
      console.error('Failed to create maintenance invoice', e);
      toast.error(
        `Failed to create invoice: ${e.response?.data?.error || e.message}`
      );
      throw e;
    }
  };

  return (
    <AppContext.Provider
      value={{
        properties,
        propertyTypes,
        unitTypes,
        units,
        leads,

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
        setUnitPrimaryImage,
        deleteUnitImage,
        addLead,
        updateLead,

        convertLeadToTenant,
        addTenant,
        addTreasurer,
        updateTreasurer,
        deleteTreasurer,
        addLease,
        endLease,
        renewLease,
        refundDeposit,
        updateLeaseDocument,
        generateMonthlyInvoices,
        submitPayment,
        verifyPayment,
        recordCashPayment,
        addMaintenanceRequest,
        updateMaintenanceRequest,
        addMaintenanceCost,
        deleteMaintenanceCost,
        addPropertyType,
        deletePropertyType,
        addUnitType,
        deleteUnitType,
        visits,
        fetchVisits,
        scheduleVisit: async (visitData: any) => {
          try {
            const response = await apiClient.post('/visits', visitData);
            // Refresh visits list if the user is authorized (owner)
            // If public user, this might fail or return empty, which is fine as they don't see the list.
            // But we want to ensure we don't error out if fetchVisits fails for public.
            // Existing fetchVisits catches errors.
            await fetchVisits();
            return response.data;
          } catch (error) {
            console.error('Failed to schedule visit:', error);
            throw error;
          }
        },
        updateVisitStatus,
        markNotificationAsRead,
        createMaintenanceInvoice,
      }}
    >
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
