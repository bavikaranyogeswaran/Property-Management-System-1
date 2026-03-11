// TypeScript types for API requests and responses

import {
  User,
  Property,
  Unit,
  Tenant,
  Lease,
  Lead,
  Payment,
  Invoice,
  MaintenanceRequest,
  Treasurer,
} from './models';

// Generic API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

// Auth API types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role: 'owner' | 'tenant' | 'treasurer';
}

export interface RegisterResponse {
  user: User;
  token: string;
}

// Property API types
export interface CreatePropertyRequest {
  name: string;
  propertyNo: string;
  street: string;
  city: string;
  district: string;
  propertyTypeId: number;
}

export interface UpdatePropertyRequest extends Partial<CreatePropertyRequest> {
  id: string;
}

// Unit API types
export interface CreateUnitRequest {
  propertyId: string;
  unitNumber: string;
  type: string;
  bedrooms: number;
  bathrooms: number;
  rent: number;
}

export interface UpdateUnitRequest extends Partial<CreateUnitRequest> {
  id: string;
}

// Tenant API types
export interface CreateTenantRequest {
  name: string;
  email: string;
  phone: string;
}

// Lead API types
export interface CreateLeadRequest {
  name: string;
  email: string;
  phone: string;
  source: string;
  notes?: string;
}

// Payment API types
export interface VerifyPaymentRequest {
  paymentId: string;
  status: 'verified' | 'rejected';
  notes?: string;
}

// Maintenance API types
export interface CreateMaintenanceRequest {
  unitId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

// List responses
export type PropertiesListResponse = ApiResponse<Property[]>;
export type UnitsListResponse = ApiResponse<Unit[]>;
export type TenantsListResponse = ApiResponse<Tenant[]>;
export type LeasesListResponse = ApiResponse<Lease[]>;
export type LeadsListResponse = ApiResponse<Lead[]>;
export type PaymentsListResponse = ApiResponse<Payment[]>;
export type InvoicesListResponse = ApiResponse<Invoice[]>;
export type MaintenanceListResponse = ApiResponse<MaintenanceRequest[]>;
export type TreasurersListResponse = ApiResponse<Treasurer[]>;
