import db from '../config/db.js';

/**
 * AuthorizationService
 * Centralizes ownership and permission checks for all resources.
 */
class AuthorizationService {
  /**
   * Checks if a user has OWNERSHIP or STAFF access to a property.
   */
  async canAccessProperty(userId, role, propertyId) {
    if (role === 'owner') {
      const [rows] = await db.query(
        'SELECT 1 FROM properties WHERE property_id = ? AND owner_id = ?',
        [propertyId, userId]
      );
      return rows.length > 0;
    }
    if (role === 'treasurer') {
      const [rows] = await db.query(
        'SELECT 1 FROM staff_property_assignments WHERE user_id = ? AND property_id = ?',
        [userId, propertyId]
      );
      return rows.length > 0;
    }
    return false;
  }

  /**
   * Checks if a user can access a specific unit.
   */
  async canAccessUnit(userId, role, unitId) {
    if (role === 'owner') {
      const [rows] = await db.query(
        `SELECT 1 FROM units u 
         JOIN properties p ON u.property_id = p.property_id 
         WHERE u.unit_id = ? AND p.owner_id = ?`,
        [unitId, userId]
      );
      return rows.length > 0;
    }
    if (role === 'treasurer') {
      const [rows] = await db.query(
        `SELECT 1 FROM units u 
         JOIN staff_property_assignments spa ON u.property_id = spa.property_id 
         WHERE u.unit_id = ? AND spa.user_id = ?`,
        [unitId, userId]
      );
      return rows.length > 0;
    }
    return false;
  }

  /**
   * Checks if a user can access a lease.
   */
  async canAccessLease(userId, role, leaseId) {
    if (role === 'owner') {
      const [rows] = await db.query(
        `SELECT 1 FROM leases l 
         JOIN units u ON l.unit_id = u.unit_id 
         JOIN properties p ON u.property_id = p.property_id 
         WHERE l.lease_id = ? AND p.owner_id = ?`,
        [leaseId, userId]
      );
      return rows.length > 0;
    }
    if (role === 'treasurer') {
      const [rows] = await db.query(
        `SELECT 1 FROM leases l 
         JOIN units u ON l.unit_id = u.unit_id 
         JOIN staff_property_assignments spa ON u.property_id = spa.property_id 
         WHERE l.lease_id = ? AND spa.user_id = ?`,
        [leaseId, userId]
      );
      return rows.length > 0;
    }
    if (role === 'tenant') {
      const [rows] = await db.query(
        'SELECT 1 FROM leases WHERE lease_id = ? AND tenant_id = ?',
        [leaseId, userId]
      );
      return rows.length > 0;
    }
    return false;
  }

  /**
   * Checks if a user can access an invoice.
   */
  async canAccessInvoice(userId, role, invoiceId) {
    if (role === 'owner') {
      const [rows] = await db.query(
        `SELECT 1 FROM rent_invoices ri 
         JOIN leases l ON ri.lease_id = l.lease_id 
         JOIN units u ON l.unit_id = u.unit_id 
         JOIN properties p ON u.property_id = p.property_id 
         WHERE ri.invoice_id = ? AND p.owner_id = ?`,
        [invoiceId, userId]
      );
      return rows.length > 0;
    }
    if (role === 'treasurer') {
      const [rows] = await db.query(
        `SELECT 1 FROM rent_invoices ri 
         JOIN leases l ON ri.lease_id = l.lease_id 
         JOIN units u ON l.unit_id = u.unit_id 
         JOIN staff_property_assignments spa ON u.property_id = spa.property_id 
         WHERE ri.invoice_id = ? AND spa.user_id = ?`,
        [invoiceId, userId]
      );
      return rows.length > 0;
    }
    if (role === 'tenant') {
      const [rows] = await db.query(
        'SELECT 1 FROM rent_invoices ri JOIN leases l ON ri.lease_id = l.lease_id WHERE ri.invoice_id = ? AND l.tenant_id = ?',
        [invoiceId, userId]
      );
      return rows.length > 0;
    }
    return false;
  }

  /**
   * Checks if a user can access a payment.
   */
  async canAccessPayment(userId, role, paymentId) {
    if (role === 'owner') {
      const [rows] = await db.query(
        `SELECT 1 FROM payments p 
         JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id 
         JOIN leases l ON ri.lease_id = l.lease_id 
         JOIN units u ON l.unit_id = u.unit_id 
         JOIN properties p_prop ON u.property_id = p_prop.property_id 
         WHERE p.payment_id = ? AND p_prop.owner_id = ?`,
        [paymentId, userId]
      );
      return rows.length > 0;
    }
    if (role === 'treasurer') {
      const [rows] = await db.query(
        `SELECT 1 FROM payments p 
         JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id 
         JOIN leases l ON ri.lease_id = l.lease_id 
         JOIN units u ON l.unit_id = u.unit_id 
         JOIN staff_property_assignments spa ON u.property_id = spa.property_id 
         WHERE p.payment_id = ? AND spa.user_id = ?`,
        [paymentId, userId]
      );
      return rows.length > 0;
    }
    if (role === 'tenant') {
      const [rows] = await db.query(
        `SELECT 1 FROM payments p 
         JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id 
         JOIN leases l ON ri.lease_id = l.lease_id 
         WHERE p.payment_id = ? AND l.tenant_id = ?`,
        [paymentId, userId]
      );
      return rows.length > 0;
    }
    return false;
  }

  /**
   * Checks if a user can access a maintenance request.
   */
  async canAccessMaintenanceRequest(userId, role, requestId) {
    if (role === 'owner') {
      const [rows] = await db.query(
        `SELECT 1 FROM maintenance_requests mr 
         JOIN units u ON mr.unit_id = u.unit_id 
         JOIN properties p ON u.property_id = p.property_id 
         WHERE mr.request_id = ? AND p.owner_id = ?`,
        [requestId, userId]
      );
      return rows.length > 0;
    }
    if (role === 'treasurer') {
      const [rows] = await db.query(
        `SELECT 1 FROM maintenance_requests mr 
         JOIN units u ON mr.unit_id = u.unit_id 
         JOIN staff_property_assignments spa ON u.property_id = spa.property_id 
         WHERE mr.request_id = ? AND spa.user_id = ?`,
        [requestId, userId]
      );
      return rows.length > 0;
    }
    if (role === 'tenant') {
      const [rows] = await db.query(
        'SELECT 1 FROM maintenance_requests WHERE request_id = ? AND tenant_id = ?',
        [requestId, userId]
      );
      return rows.length > 0;
    }
    return false;
  }
}

export default new AuthorizationService();
