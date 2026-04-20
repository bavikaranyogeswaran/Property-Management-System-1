// ============================================================================
//  RENEWAL SERVICE (The Retention Expert)
// ============================================================================
//  This service manages the negotiation for lease extensions.
//  It handles term proposals, tenant acceptance/rejection, and
//  automatically rolling over deposits to new agreements.
// ============================================================================

import renewalRequestModel from '../models/renewalRequestModel.js';
import leaseModel from '../models/leaseModel.js';
import userModel from '../models/userModel.js';
import unitModel from '../models/unitModel.js';
import propertyModel from '../models/propertyModel.js';
import pool from '../config/db.js';
import emailService from '../utils/emailService.js';
import {
  addDays,
  parseLocalDate,
  formatToLocalDate,
  getLocalTime,
} from '../utils/dateUtils.js';
import { toCentsFromMajor } from '../utils/moneyUtils.js';
import auditLogger from '../utils/auditLogger.js';
import AppError from '../utils/AppError.js';
import { isAtLeast, ROLES } from '../utils/roleUtils.js';
import staffModel from '../models/staffModel.js';
import notificationModel from '../models/notificationModel.js';

/**
 * [ARCHITECTURAL SEMANTICS]
 * Note on 3NF constraints regarding `renewal_requests.current_monthly_rent`:
 * This column is a DELIBERATE HISTORICAL SNAPSHOT of the lease's contractual
 * rent at the exact moment the renewal was initiated.
 *
 * It must NOT be dynamically synced or joined to `leases.monthly_rent` after
 * creation, as this would fraudulently alter the historical context of past
 * negotiations and audit trails.
 */
class RenewalService {
  // CREATE FROM NOTICE: Starts a renewal pipeline if a tenant decides they want to stay.
  async createFromNotice(leaseId, user = null) {
    // 1. Fetch lease and check for existing pipeline
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new AppError('Lease not found', 404);

    const existing = await renewalRequestModel.findByLeaseId(leaseId);
    if (existing && ['pending', 'negotiating'].includes(existing.status)) {
      return existing.request_id;
    }

    // 2. Create renewal request record
    const requestId = await renewalRequestModel.create({
      leaseId: leaseId,
      currentMonthlyRent: lease.monthlyRent,
      status: 'pending',
      requestedBy:
        user?.role === ROLES.TENANT
          ? ROLES.TENANT
          : user?.role === ROLES.TREASURER
            ? 'staff'
            : ROLES.SYSTEM,
    });

    // 3. [AUDIT] Log request initiation
    await auditLogger.log({
      userId: user?.id || null,
      actionType: 'RENEWAL_REQUEST_CREATED',
      entityId: requestId,
      entityType: 'renewal_request',
      details: { leaseId, unitId: lease.unitId },
    });

    return requestId;
  }

  // PROPOSE TERMS: Staff step. Sends the new rent and end date to the tenant for review.
  async proposeTerms(requestId, data, user) {
    // 1. Fetch request and validate proposed dates vs existing lease
    const request = await renewalRequestModel.findById(requestId);
    if (!request) throw new AppError('Renewal request not found', 404);

    if (!data.proposedEndDate) {
      throw new AppError('Proposed end date is required.', 400);
    }
    const leaseForTerm = await leaseModel.findById(
      request.leaseId || request.lease_id
    );
    if (
      parseLocalDate(data.proposedEndDate) <=
      parseLocalDate(leaseForTerm.endDate)
    ) {
      throw new AppError(
        `Proposed end date must be after current lease end date.`,
        400
      );
    }

    // 2. [SECURITY] RBAC: Ensure staff is assigned to this property
    if (user.role === ROLES.TREASURER) {
      const assigned = await staffModel.getAssignedProperties(user.id);
      if (
        !assigned.some(
          (p) => String(p.property_id) === String(request.property_id)
        )
      ) {
        throw new AppError('Access denied: Property assignment required.', 403);
      }
    }

    // 3. Update request with new proposal and set acceptance deadline
    await renewalRequestModel.updateTerms(requestId, {
      proposedMonthlyRent: Number(data.proposedMonthlyRent),
      proposedEndDate: data.proposedEndDate,
      notes: data.notes,
      status: 'negotiating',
      acceptanceDeadline: formatToLocalDate(addDays(getLocalTime(), 7)),
    });

    // 4. [AUDIT] Log the proposal
    await auditLogger.log({
      userId: user.id || user.user_id,
      actionType: 'RENEWAL_TERMS_PROPOSED',
      entityId: requestId,
      entityType: 'renewal_request',
      details: data,
    });

    // 5. [SIDE EFFECT] Notify tenant of new terms via email
    try {
      const lease = await leaseModel.findById(
        request.lease_id || request.leaseId
      );
      const tenantUser = await userModel.findById(lease.tenantId);
      if (tenantUser && tenantUser.email) {
        const property = await propertyModel.findById(
          request.property_id || request.propertyId
        );
        await emailService.sendRenewalProposed(
          tenantUser.email,
          property.name,
          Number(data.proposedMonthlyRent)
        );
      }
    } catch (err) {
      console.warn('[RENEWAL] Notification failed:', err.message);
    }
  }

  // APPROVE: The final step. Activates the new lease and archives the old one.
  async approve(requestId, user, overrideStatusCheck = false) {
    // 1. Fetch request and validate state integrity
    const request = await renewalRequestModel.findById(requestId);
    if (!request) throw new AppError('Renewal request not found', 404);

    if (!overrideStatusCheck && request.status !== 'tenant_accepted') {
      throw new AppError(
        'Cannot approve: Tenant must accept terms first.',
        400
      );
    }

    // 2. [SECURITY] RBAC check
    if (user.role === ROLES.TREASURER) {
      const assigned = await staffModel.getAssignedProperties(user.id);
      if (
        !assigned.some(
          (p) => String(p.property_id) === String(request.property_id)
        )
      ) {
        throw new AppError('Access denied: Assignment required.', 403);
      }
    }

    if (!request.proposed_monthly_rent || !request.proposed_end_date) {
      throw new AppError(
        'Proposed terms (rent/date) are required for approval',
        400
      );
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 3. Mark request as approved
      await renewalRequestModel.updateStatus(requestId, 'approved', connection);

      // 4. Calculate new lease start date (day after old lease ends)
      const lease = await leaseModel.findById(request.lease_id, connection);
      const nextStartDate = addDays(parseLocalDate(lease.endDate), 1);
      const nextStartDateStr = formatToLocalDate(nextStartDate);

      if (parseLocalDate(request.proposed_end_date) <= nextStartDate) {
        throw new AppError(
          'Approval failed: renewal end date must be after start date.',
          400
        );
      }

      // 5. [CONCURRENCY] Atomic Overlap Check
      const proposedEndDate =
        request.proposedEndDate || request.proposed_end_date;
      const [overlapping] = await connection.query(
        `SELECT lease_id FROM leases WHERE unit_id = ? AND status IN ('active', 'draft', 'pending') AND start_date <= ? AND end_date >= ?`,
        [lease.unitId, proposedEndDate, nextStartDateStr]
      );
      if (overlapping.length > 0)
        throw new AppError(
          'Unit already has an overlapping active lease.',
          409
        );

      // 6. [FINANCIAL] Calculate and move security deposit balance
      const oldDepositBalance = await leaseModel.getDepositBalance(
        request.lease_id,
        connection
      );
      const targetDeposit =
        request.proposedMonthlyRent || request.proposed_monthly_rent;

      // 7. Create the new Active Lease record
      const newLeaseId = await leaseModel.create(
        {
          tenantId: lease.tenantId,
          unitId: lease.unitId,
          startDate: nextStartDateStr,
          endDate: request.proposedEndDate || request.proposed_end_date,
          monthlyRent:
            request.proposedMonthlyRent || request.proposed_monthly_rent,
          status: 'active',
          depositStatus:
            oldDepositBalance >= targetDeposit ? 'paid' : 'pending',
          targetDeposit: targetDeposit,
          documentUrl: lease.documentUrl,
          isDocumentsVerified: true,
          signedAt: getLocalTime(),
          reservationExpiresAt: null,
        },
        connection
      );

      // 8. [FINANCIAL] Perform atomic ledger transfer from old to new lease
      if (oldDepositBalance > 0) {
        await connection.query(
          `INSERT INTO accounting_ledger (lease_id, account_type, category, debit, credit, description, entry_date)
           VALUES (?, 'liability', 'deposit_held', ?, 0, ?, ?), (?, 'liability', 'deposit_held', 0, ?, ?, ?)`,
          [
            request.lease_id,
            oldDepositBalance,
            `Deposit Rollover to Renewal #${newLeaseId}`,
            nextStartDateStr,
            newLeaseId,
            oldDepositBalance,
            `Deposit Rollover from Previous #${request.lease_id}`,
            nextStartDateStr,
          ]
        );
      }

      // 9. [AUDIT] Log finalization
      await auditLogger.log(
        {
          userId: user.id || user.user_id,
          actionType: 'RENEWAL_APPROVED',
          entityId: requestId,
          entityType: 'renewal_request',
          details: { newLeaseId, proposedRent: request.proposed_monthly_rent },
        },
        null,
        connection
      );

      await connection.commit();

      // 10. [SIDE EFFECT] Notify tenant of successful renewal
      try {
        const tenantUser = await userModel.findById(lease.tenantId);
        const unit = await unitModel.findById(lease.unitId);
        const property = await propertyModel.findById(unit.propertyId);
        if (tenantUser?.email)
          await emailService.sendRenewalApproval(
            tenantUser.email,
            property.name,
            newLeaseId
          );
      } catch (err) {
        console.error('Failed to send renewal approval email:', err);
      }

      return { newLeaseId };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // REJECT: Rejects a renewal request and resets the lease notice status.
  async reject(requestId, user) {
    // 1. Fetch request and validate RBAC
    const request = await renewalRequestModel.findById(requestId);
    if (!request) throw new AppError('Renewal request not found', 404);

    if (user.role === ROLES.TREASURER) {
      const assigned = await staffModel.getAssignedProperties(user.id);
      if (
        !assigned.some(
          (p) => String(p.property_id) === String(request.property_id)
        )
      ) {
        throw new AppError('Access denied: Property assignment required.', 403);
      }
    }

    // 2. Perform status updates
    await renewalRequestModel.updateStatus(requestId, 'rejected');
    await leaseModel.update(request.lease_id, { notice_status: 'undecided' });

    // 3. [AUDIT] Log the rejection
    await auditLogger.log({
      userId: user.id || user.user_id,
      actionType: 'RENEWAL_REJECTED',
      entityId: requestId,
      entityType: 'renewal_request',
    });

    // 4. [SIDE EFFECT] Notify tenant via email
    try {
      const lease = await leaseModel.findById(request.lease_id);
      const tenantUser = await userModel.findById(lease.tenantId);
      const unit = await unitModel.findById(lease.unitId);
      const property = await propertyModel.findById(unit.propertyId);
      if (tenantUser?.email)
        await emailService.sendRenewalRejection(
          tenantUser.email,
          property.name,
          null
        );
    } catch (err) {
      console.error('Failed to send renewal rejection email:', err);
    }
  }

  // TENANT ACCEPT: The tenant says "Yes" to the new proposed deal.
  async tenantAccept(requestId, user) {
    // 1. Fetch request and validate state and ownership
    const request = await renewalRequestModel.findById(requestId);
    if (!request) throw new AppError('Renewal request not found', 404);

    if (request.status !== 'negotiating') {
      throw new AppError('Terms must be proposed before acceptance.', 400);
    }

    const lease = await leaseModel.findById(
      request.leaseId || request.lease_id
    );
    if (String(lease.tenantId) !== String(user.id)) {
      throw new AppError(
        'Access denied: only the lease tenant can accept.',
        403
      );
    }

    // 2. [SECURITY] Deadline check
    if (
      request.acceptanceDeadline &&
      new Date() > parseLocalDate(request.acceptanceDeadline)
    ) {
      throw new AppError(
        'The acceptance window for this renewal proposal has expired.',
        400
      );
    }

    // 3. Update status to 'tenant_accepted'
    await renewalRequestModel.updateStatus(requestId, 'tenant_accepted');

    // 4. [AUDIT] Log the tenant's decision
    await auditLogger.log({
      userId: user.id,
      actionType: 'RENEWAL_ACCEPTED_BY_TENANT',
      entityId: requestId,
      entityType: 'renewal_request',
      details: { leaseId: request.leaseId || request.lease_id },
    });

    // 5. [SIDE EFFECT] Notify Staff (Treasurers) to finalize the process
    try {
      const [treasurers] = await pool.query(
        'SELECT user_id FROM users WHERE role = ? AND status = "active"',
        [ROLES.TREASURER]
      );
      for (const t of treasurers) {
        await notificationModel.create({
          userId: t.user_id,
          message: `Tenant has accepted renewal terms for Lease #${request.leaseId || request.lease_id} (Unit ${request.unitNumber}). Proceed with final approval.`,
          type: 'lease_update',
          entityType: 'renewal_request',
          entityId: requestId,
        });
      }
    } catch (err) {
      console.warn(
        '[RENEWAL] Failed to notify treasurers of acceptance:',
        err.message
      );
    }

    return true;
  }

  // TENANT DECLINE: The tenant says "No" and requests a better deal.
  async tenantDecline(requestId, user) {
    // 1. Fetch request and validate ownership
    const request = await renewalRequestModel.findById(requestId);
    if (!request) throw new AppError('Renewal request not found', 404);

    if (request.status !== 'negotiating') {
      throw new AppError(
        `Cannot decline: renewal is in '${request.status}' status.`,
        400
      );
    }

    const lease = await leaseModel.findById(
      request.leaseId || request.lease_id
    );
    if (String(lease.tenantId) !== String(user.id)) {
      throw new AppError(
        'Access denied: only the lease tenant can decline.',
        403
      );
    }

    // 2. Reset status to 'negotiating' to allow staff to revise terms
    await renewalRequestModel.updateStatus(requestId, 'negotiating');

    // 3. [AUDIT] Log the refusal
    await auditLogger.log({
      userId: user.id,
      actionType: 'RENEWAL_DECLINED_BY_TENANT',
      entityId: requestId,
      entityType: 'renewal_request',
    });

    // 4. [SIDE EFFECT] Notify Staff that a revision is needed
    try {
      const [treasurers] = await pool.query(
        'SELECT user_id FROM users WHERE role = ? AND status = "active"',
        [ROLES.TREASURER]
      );
      for (const t of treasurers) {
        await notificationModel.create({
          userId: t.user_id,
          message: `Tenant has declined renewal terms for Lease #${request.leaseId || request.lease_id}. Please revise the proposal.`,
          type: 'lease_update',
          severity: 'warning',
          entityType: 'renewal_request',
          entityId: requestId,
        });
      }
    } catch (err) {
      console.warn('[RENEWAL] Failed to notify of refusal:', err.message);
    }

    return true;
  }

  // INSTANT RENEW: Privileged override used by owners for bulk renewals.
  async instantRenew(leaseId, newEndDate, newMonthlyRent, user) {
    // [PRIVILEGED OVERRIDE] bypasses the 'tenant_accepted' gate for staff operations.
    // 1. Initiate renewal pipeline
    const requestId = await this.createFromNotice(leaseId, user);

    const request = await renewalRequestModel.findById(requestId);
    if (request.status === 'approved') {
      throw new AppError('This lease renewal has already been approved.', 409);
    }

    // 2. Set new terms automatically
    await this.proposeTerms(
      requestId,
      {
        proposedMonthlyRent: newMonthlyRent,
        proposedEndDate: newEndDate,
        notes: 'Auto-renewed by property manager.',
      },
      user
    );

    // 3. Finalize approval automatically (bypassing tenant sign-off)
    return await this.approve(requestId, user, true);
  }

  // GET REQUESTS: Fetches relevant renewal requests based on user role.
  async getRequests(user) {
    if (user.role === ROLES.SYSTEM)
      return await renewalRequestModel.findAll({});
    if (user.role === ROLES.OWNER)
      return await renewalRequestModel.findAll({ ownerId: user.id });
    if (user.role === ROLES.TREASURER)
      return await renewalRequestModel.findAll({ treasurerId: user.id });

    if (user.role === ROLES.TENANT) {
      const tenantLeases = await leaseModel.findByTenantId(user.id);
      const allRequests = [];
      for (const lease of tenantLeases) {
        const req = await renewalRequestModel.findByLeaseId(lease.id);
        if (req) allRequests.push(req);
      }
      return allRequests;
    }
    throw new AppError('Access denied', 403);
  }

  /**
   * [H11 NEW] Automatically cancels any pending renewal requests for a lease.
   * Triggered when a tenant decides to vacate.
   */
  // CANCEL PENDING RENEWALS: Auto-cancels negotiations when a lease is set to terminate.
  async cancelPendingRenewals(leaseId, connection = null) {
    const db = connection || pool;
    await db.query(
      "UPDATE renewal_requests SET status = 'cancelled' WHERE lease_id = ? AND status IN ('pending', 'negotiating')",
      [leaseId]
    );
  }
}

export default new RenewalService();
