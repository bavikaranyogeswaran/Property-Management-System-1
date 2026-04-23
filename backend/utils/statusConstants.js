// ============================================================================
//  STATUS CONSTANTS (The Single Source of Truth)
// ============================================================================
//  Centralized definitions for all entity states across the system.
//  Use these instead of hardcoded strings to prevent typos and logic drift.
// ============================================================================

export const LEASE_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  ACTIVE: 'active',
  ENDED: 'ended',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  TERMINATED: 'terminated',
});

export const UNIT_STATUS = Object.freeze({
  AVAILABLE: 'available',
  RESERVED: 'reserved',
  OCCUPIED: 'occupied',
  MAINTENANCE: 'maintenance',
  INACTIVE: 'inactive',
});

export const INVOICE_STATUS = Object.freeze({
  PENDING: 'pending',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  VOIDED: 'voided',
  CORRECTED: 'corrected',
});

export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
});
