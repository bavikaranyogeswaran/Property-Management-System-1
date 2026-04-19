// ============================================================================
//  AUTHORIZATION SERVICE (The Gatekeeper)
// ============================================================================
//  This service centralizes all security checks.
//  It verifies if a User (Tenant, Owner, or Staff) has the right to
//  view or modify a specific Resource (Property, Unit, Lease, etc.).
// ============================================================================

import pool from '../config/db.js';
import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import invoiceModel from '../models/invoiceModel.js';
import paymentModel from '../models/paymentModel.js';
import maintenanceRequestModel from '../models/maintenanceRequestModel.js';
import staffModel from '../models/staffModel.js';
import { ROLES, isAtLeast } from '../utils/roleUtils.js';

class AuthorizationService {
  /**
   * Checks if a user has OWNERSHIP or STAFF access to a property.
   */
  // CAN ACCESS PROPERTY: Verifies if the user is the owner or an assigned staff member.
  async canAccessProperty(userId, role, propertyId) {
    if (role === ROLES.SYSTEM) return true;

    // 1. Fetch property to check direct ownership
    const property = await propertyModel.findById(propertyId);
    if (!property) return false;

    // 2. Ownership check
    if (property.ownerId.toString() === userId.toString()) return true;

    // 3. Staff check: Optimized via StaffModel point-check
    if (isAtLeast(role, ROLES.TREASURER)) {
      return await staffModel.isAssignedToProperty(userId, propertyId);
    }

    return false;
  }

  /**
   * Checks if a user can access a specific unit.
   * [FLATTENED]: Uses JOIN to check property ownership/assignment in one query.
   */
  async canAccessUnit(userId, role, unitId) {
    if (role === ROLES.SYSTEM) return true;

    const [rows] = await pool.query(
      `
            SELECT p.owner_id, spa.user_id as assigned_staff_id
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            LEFT JOIN staff_property_assignments spa ON p.property_id = spa.property_id AND spa.user_id = ?
            WHERE u.unit_id = ? AND p.is_archived = FALSE
        `,
      [userId, unitId]
    );

    if (rows.length === 0) return false;
    const row = rows[0];

    // Ownership or Assignment check
    if (row.owner_id.toString() === userId.toString()) return true;
    if (isAtLeast(role, ROLES.TREASURER) && row.assigned_staff_id !== null)
      return true;

    return false;
  }

  /**
   * Checks if a user can access a lease.
   * [FLATTENED]: Single query handles Tenant, Owner, and Staff checks.
   */
  // CAN ACCESS LEASE: Multi-role check for Tenants (their own lease), Owners, and assigned Staff.
  async canAccessLease(userId, role, leaseId) {
    if (role === ROLES.SYSTEM) return true;

    const [rows] = await pool.query(
      `
            SELECT l.tenant_id, p.owner_id, spa.user_id as assigned_staff_id
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            LEFT JOIN staff_property_assignments spa ON p.property_id = spa.property_id AND spa.user_id = ?
            WHERE l.lease_id = ? AND p.is_archived = FALSE
        `,
      [userId, leaseId]
    );

    if (rows.length === 0) return false;
    const row = rows[0];

    // 1. Tenant Check
    if (role === ROLES.TENANT && row.tenant_id.toString() === userId.toString())
      return true;

    // 2. Owner Check
    if (row.owner_id.toString() === userId.toString()) return true;

    // 3. Staff Check
    if (isAtLeast(role, ROLES.TREASURER) && row.assigned_staff_id !== null)
      return true;

    return false;
  }

  /**
   * Checks if a user can access an invoice.
   */
  async canAccessInvoice(userId, role, invoiceId) {
    if (role === ROLES.SYSTEM) return true;

    const [rows] = await pool.query(
      `
            SELECT l.tenant_id, p.owner_id, spa.user_id as assigned_staff_id
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            LEFT JOIN staff_property_assignments spa ON p.property_id = spa.property_id AND spa.user_id = ?
            WHERE ri.invoice_id = ? AND p.is_archived = FALSE
        `,
      [userId, invoiceId]
    );

    if (rows.length === 0) return false;
    const row = rows[0];

    if (role === ROLES.TENANT && row.tenant_id.toString() === userId.toString())
      return true;
    if (row.owner_id.toString() === userId.toString()) return true;
    if (isAtLeast(role, ROLES.TREASURER) && row.assigned_staff_id !== null)
      return true;

    return false;
  }

  /**
   * Checks if a user can access a payment.
   */
  async canAccessPayment(userId, role, paymentId) {
    if (role === ROLES.SYSTEM) return true;

    const [rows] = await pool.query(
      `
            SELECT l.tenant_id, p.owner_id, spa.user_id as assigned_staff_id
            FROM payments py
            JOIN rent_invoices ri ON py.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            LEFT JOIN staff_property_assignments spa ON p.property_id = spa.property_id AND spa.user_id = ?
            WHERE py.payment_id = ? AND p.is_archived = FALSE
        `,
      [userId, paymentId]
    );

    if (rows.length === 0) return false;
    const row = rows[0];

    if (role === ROLES.TENANT && row.tenant_id.toString() === userId.toString())
      return true;
    if (row.owner_id.toString() === userId.toString()) return true;
    if (isAtLeast(role, ROLES.TREASURER) && row.assigned_staff_id !== null)
      return true;

    return false;
  }

  /**
   * Checks if a user can access a maintenance request.
   */
  async canAccessMaintenanceRequest(userId, role, requestId) {
    if (role === ROLES.SYSTEM) return true;

    const [rows] = await pool.query(
      `
            SELECT mr.tenant_id, p.owner_id, spa.user_id as assigned_staff_id
            FROM maintenance_requests mr
            JOIN units u ON mr.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            LEFT JOIN staff_property_assignments spa ON p.property_id = spa.property_id AND spa.user_id = ?
            WHERE mr.request_id = ? AND p.is_archived = FALSE
        `,
      [userId, requestId]
    );

    if (rows.length === 0) return false;
    const row = rows[0];

    if (role === ROLES.TENANT && row.tenant_id.toString() === userId.toString())
      return true;
    if (row.owner_id.toString() === userId.toString()) return true;
    if (isAtLeast(role, ROLES.TREASURER) && row.assigned_staff_id !== null)
      return true;

    return false;
  }

  /**
   * Checks if a staff member (Treasurer) or System can access an owner's portfolio.
   */
  async canAccessOwner(userId, role, ownerId) {
    if (role === ROLES.SYSTEM) return true;

    // 1. Ownership check: If you are the owner, you can access your own portfolio
    if (userId.toString() === ownerId.toString()) return true;

    // 2. Staff check: Optimized via PropertyModel's JOIN-based assignment point-check
    if (isAtLeast(role, ROLES.TREASURER)) {
      return await propertyModel.isStaffAssignedToOwner(userId, ownerId);
    }

    return false;
  }

  /**
   * Helper to check role level.
   */
  isAtLeast(currentRole, targetRole) {
    return isAtLeast(currentRole, targetRole);
  }
}

export default new AuthorizationService();
