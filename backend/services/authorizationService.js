
import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import invoiceModel from '../models/invoiceModel.js';
import paymentModel from '../models/paymentModel.js';
import maintenanceRequestModel from '../models/maintenanceRequestModel.js';
import staffModel from '../models/staffModel.js';
import { ROLES, ROLE_LEVELS, isAtLeast } from '../utils/roleUtils.js';

/**
 * AuthorizationService
 * Centralizes ownership and permission checks for all resources.
 */
class AuthorizationService {
  /**
   * Checks if a user has OWNERSHIP or STAFF access to a property.
   * [HIERARCHY AWARE]: Owners can access property records even if checking for treasurer-level staff access.
   */
  async canAccessProperty(userId, role, propertyId) {
    const property = await propertyModel.findById(propertyId);
    if (!property) return false;

    // 1. Ownership check: If you own it, you can access it (regardless of role level)
    if (property.ownerId === userId) return true;

    // 2. System access
    if (role === ROLES.SYSTEM) return true;

    // 3. Staff check: Only treasurers assigned to THIS property have access
    if (isAtLeast(role, ROLES.TREASURER)) {
      const assigned = await staffModel.getAssignedProperties(userId);
      return assigned.some(p => p.property_id.toString() === propertyId.toString());
    }

    return false;
  }

  /**
   * Checks if a role has at least the required permission level.
   */
  isAtLeast(currentRole, targetRole) {
    return isAtLeast(currentRole, targetRole);
  }

  /**
   * Checks if a user can access a specific unit.
   */
  async canAccessUnit(userId, role, unitId) {
    const unit = await unitModel.findById(unitId);
    if (!unit) return false;

    return await this.canAccessProperty(userId, role, unit.propertyId);
  }

  /**
   * Checks if a user can access a lease.
   */
  async canAccessLease(userId, role, leaseId) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) return false;

    if (role === 'tenant') {
      return lease.tenantId === userId.toString();
    }

    return await this.canAccessUnit(userId, role, lease.unitId);
  }

  /**
   * Checks if a user can access an invoice.
   */
  async canAccessInvoice(userId, role, invoiceId) {
    const invoice = await invoiceModel.findById(invoiceId);
    if (!invoice) return false;

    // Use lease access check for consistency
    return await this.canAccessLease(userId, role, invoice.leaseId);
  }

  /**
   * Checks if a user can access a payment.
   */
  async canAccessPayment(userId, role, paymentId) {
    const payment = await paymentModel.findById(paymentId);
    if (!payment) return false;

    // A payment is linked to an invoice, which is linked to a lease
    return await this.canAccessInvoice(userId, role, payment.invoiceId);
  }

  /**
   * Checks if a user can access a maintenance request.
   */
  async canAccessMaintenanceRequest(userId, role, requestId) {
    const request = await maintenanceRequestModel.findById(requestId);
    if (!request) return false;

    if (role === 'tenant') {
      return request.tenantId === userId.toString();
    }

    return await this.canAccessUnit(userId, role, request.unitId);
  }
}

export default new AuthorizationService();
