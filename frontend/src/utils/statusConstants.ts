/**
 * STATUS CONSTANTS (Frontend)
 *
 * Centralized definitions for all entity states.
 * Synchronized with backend/utils/statusConstants.js
 */

export const LEASE_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  ACTIVE: 'active',
  ENDED: 'ended',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  TERMINATED: 'terminated',
} as const;

export type LeaseStatus = (typeof LEASE_STATUS)[keyof typeof LEASE_STATUS];

export const UNIT_STATUS = {
  AVAILABLE: 'available',
  RESERVED: 'reserved',
  OCCUPIED: 'occupied',
  MAINTENANCE: 'maintenance',
  INACTIVE: 'inactive',
} as const;

export type UnitStatus = (typeof UNIT_STATUS)[keyof typeof UNIT_STATUS];

export const INVOICE_STATUS = {
  PENDING: 'pending',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  VOIDED: 'voided',
  CORRECTED: 'corrected',
} as const;

export type InvoiceStatus =
  (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
} as const;

export type PaymentStatus =
  (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
