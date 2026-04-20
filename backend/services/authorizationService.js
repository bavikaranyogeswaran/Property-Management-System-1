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
    // [SECURITY] System role bypass
    if (role === ROLES.SYSTEM) return true;

    const property = await propertyModel.findById(propertyId);
    if (!property) return false;

    // 1. [SECURITY] Ownership check (Direct comparison)
    if (property.ownerId.toString() === userId.toString()) return true;

    // 2. [SECURITY] Staff assignment check (Delegated to StaffModel)
    if (isAtLeast(role, ROLES.TREASURER))
      return await staffModel.isAssignedToProperty(userId, propertyId);

    return false;
  }

  /**
   * Checks if a user can access a specific unit.
   * [FLATTENED]: Uses JOIN to check property ownership/assignment in one query.
   */
  // CAN ACCESS UNIT: Validates permission to view/edit a specific rental unit.
  async canAccessUnit(userId, role, unitId) {
    if (role === ROLES.SYSTEM) return true;

    // 1. [SECURITY] Flat query: fetch property ownership and staff assignment in one join
    const [rows] = await pool.query(
      `SELECT p.owner_id, spa.user_id as assigned_staff_id FROM units u JOIN properties p ON u.property_id = p.property_id LEFT JOIN staff_property_assignments spa ON p.property_id = spa.property_id AND spa.user_id = ? WHERE u.unit_id = ? AND p.is_archived = FALSE`,
      [userId, unitId]
    );
    if (rows.length === 0) return false;
    const row = rows[0];

    // 2. [SECURITY] Grant if Owner or Assigned Staff
    if (row.owner_id.toString() === userId.toString()) return true;
    if (isAtLeast(role, ROLES.TREASURER) && row.assigned_staff_id !== null)
      return true;

    return false;
  }

  /**
   * Checks if a user can access a lease.
   * [FLATTENED]: Single query handles Tenant, Owner, and Staff checks.
   */
  // CAN ACCESS LEASE: Verifies access to the rental contract. Handles Tenants (own lease only), Owners, and Staff.
  async canAccessLease(userId, role, leaseId) {
    if (role === ROLES.SYSTEM) return true;

    // 1. [SECURITY] Deep join to resolve resource path: Lease -> Unit -> Property -> Assignment
    const [rows] = await pool.query(
      `SELECT l.tenant_id, p.owner_id, spa.user_id as assigned_staff_id FROM leases l JOIN units u ON l.unit_id = u.unit_id JOIN properties p ON u.property_id = p.property_id LEFT JOIN staff_property_assignments spa ON p.property_id = spa.property_id AND spa.user_id = ? WHERE l.lease_id = ? AND p.is_archived = FALSE`,
      [userId, leaseId]
    );
    if (rows.length === 0) return false;
    const row = rows[0];

    // 2. [SECURITY] Tenant check: Restricted to their specific contract
    if (role === ROLES.TENANT && row.tenant_id.toString() === userId.toString())
      return true;

    // 3. [SECURITY] Staff/Owner check: Inherited from property access
    if (row.owner_id.toString() === userId.toString()) return true;
    if (isAtLeast(role, ROLES.TREASURER) && row.assigned_staff_id !== null)
      return true;

    return false;
  }

  /**
   * Checks if a user can access an invoice.
   */
  // CAN ACCESS INVOICE: Verifies permission to view financial billing.
  async canAccessInvoice(userId, role, invoiceId) {
    if (role === ROLES.SYSTEM) return true;

    // 1. [SECURITY] Aggregate security context from financial record up to property assignment
    const [rows] = await pool.query(
      `SELECT l.tenant_id, p.owner_id, spa.user_id as assigned_staff_id FROM rent_invoices ri JOIN leases l ON ri.lease_id = l.lease_id JOIN units u ON l.unit_id = u.unit_id JOIN properties p ON u.property_id = p.property_id LEFT JOIN staff_property_assignments spa ON p.property_id = spa.property_id AND spa.user_id = ? WHERE ri.invoice_id = ? AND p.is_archived = FALSE`,
      [userId, invoiceId]
    );
    if (rows.length === 0) return false;
    const row = rows[0];

    // 2. Identity-based grant
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
  // CAN ACCESS PAYMENT: Validates permission to view transaction records.
  async canAccessPayment(userId, role, paymentId) {
    if (role === ROLES.SYSTEM) return true;

    // 1. [SECURITY] Trace payment through invoice and lease to verify property-level rights
    const [rows] = await pool.query(
      `SELECT l.tenant_id, p.owner_id, spa.user_id as assigned_staff_id FROM payments py JOIN rent_invoices ri ON py.invoice_id = ri.invoice_id JOIN leases l ON ri.lease_id = l.lease_id JOIN units u ON l.unit_id = u.unit_id JOIN properties p ON u.property_id = p.property_id LEFT JOIN staff_property_assignments spa ON p.property_id = spa.property_id AND spa.user_id = ? WHERE py.payment_id = ? AND p.is_archived = FALSE`,
      [userId, paymentId]
    );
    if (rows.length === 0) return false;
    const row = rows[0];

    // 2. Federated grant logic
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
  // CAN ACCESS MAINTENANCE: Verifies permission to view/modify repair tickets.
  async canAccessMaintenanceRequest(userId, role, requestId) {
    if (role === ROLES.SYSTEM) return true;

    // 1. [SECURITY] Verify request origin (Tenant who filed it) or property authority (Owner/Staff)
    const [rows] = await pool.query(
      `SELECT mr.tenant_id, p.owner_id, spa.user_id as assigned_staff_id FROM maintenance_requests mr JOIN units u ON mr.unit_id = u.unit_id JOIN properties p ON u.property_id = p.property_id LEFT JOIN staff_property_assignments spa ON p.property_id = spa.property_id AND spa.user_id = ? WHERE mr.request_id = ? AND p.is_archived = FALSE`,
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
  // CAN ACCESS OWNER: Determines if a System or Staff member can manage another user's portfolio.
  async canAccessOwner(userId, role, ownerId) {
    if (role === ROLES.SYSTEM) return true;

    // 1. [SECURITY] Self-access check
    if (userId.toString() === ownerId.toString()) return true;

    // 2. [SECURITY] Staff cross-check: verify if Treasurer is assigned to any of the owner's properties
    if (isAtLeast(role, ROLES.TREASURER))
      return await propertyModel.isStaffAssignedToOwner(userId, ownerId);

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
