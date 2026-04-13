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
  async createFromNotice(leaseId, user = null) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new AppError('Lease not found', 404);

    // Check if a pending or negotiating request already exists
    const existing = await renewalRequestModel.findByLeaseId(leaseId);
    if (existing && ['pending', 'negotiating'].includes(existing.status)) {
      return existing.request_id;
    }

    const requestId = await renewalRequestModel.create({
      leaseId: leaseId,
      currentMonthlyRent: lease.monthlyRent,
      status: 'pending',
      requestedBy:
        user?.role === ROLES.TENANT
          ? ROLES.TENANT
          : user?.role === ROLES.TREASURER
            ? 'staff'
            : ROLES.SYSTEM, // [H19]
    });

    await auditLogger.log({
      userId: user?.id || null,
      actionType: 'RENEWAL_REQUEST_CREATED',
      entityId: requestId,
      entityType: 'renewal_request',
      details: { leaseId, unitId: lease.unitId },
    });

    return requestId;
  }

  async proposeTerms(requestId, data, user) {
    const request = await renewalRequestModel.findById(requestId);
    if (!request) throw new AppError('Renewal request not found', 404);

    // [F2.5] Validate proposed end date is after current lease end date
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
        `Proposed end date (${data.proposedEndDate}) must be after the current lease end date (${leaseForTerm.endDate}).`,
        400
      );
    }

    // RBAC: Treasurer assignment check
    if (user.role === ROLES.TREASURER) {
      const staffModel = (await import('../models/staffModel.js')).default;
      const assigned = await staffModel.getAssignedProperties(user.id);
      if (
        !assigned.some(
          (p) => String(p.property_id) === String(request.property_id)
        )
      ) {
        throw new AppError(
          'Access denied. You are not assigned to this property.',
          403
        );
      }
    }

    await renewalRequestModel.updateTerms(requestId, {
      proposedMonthlyRent: toCentsFromMajor(data.proposedMonthlyRent),
      proposedEndDate: data.proposedEndDate,
      notes: data.notes,
      status: 'negotiating',
      acceptanceDeadline: formatToLocalDate(addDays(getLocalTime(), 7)),
    });

    await auditLogger.log({
      userId: user.id || user.user_id,
      actionType: 'RENEWAL_TERMS_PROPOSED',
      entityId: requestId,
      entityType: 'renewal_request',
      details: data,
    });

    // [H11 FIX] Added notification to tenant when terms are proposed
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
          toCentsFromMajor(data.proposedMonthlyRent)
        );
      }
    } catch (err) {
      console.warn('[RENEWAL] Notification failed:', err.message);
    }
  }

  async approve(requestId, user) {
    const request = await renewalRequestModel.findById(requestId);
    if (!request) throw new AppError('Renewal request not found', 404);

    // [FIX] Tenant must have explicitly accepted terms before staff can finalise
    if (request.status !== 'tenant_accepted') {
      throw new AppError(
        `Cannot approve: renewal is in '${request.status}' status. Tenant must accept proposed terms first.`,
        400
      );
    }

    // RBAC: Treasurer assignment check
    if (user.role === ROLES.TREASURER) {
      const staffModel = (await import('../models/staffModel.js')).default;
      const assigned = await staffModel.getAssignedProperties(user.id);
      if (
        !assigned.some(
          (p) => String(p.property_id) === String(request.property_id)
        )
      ) {
        throw new AppError(
          'Access denied. You are not assigned to this property.',
          403
        );
      }
    }

    if (!request.proposed_monthly_rent || !request.proposed_end_date) {
      throw new AppError(
        'Proposed terms (rent and end date) are required for approval',
        400
      );
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Mark request as approved
      await renewalRequestModel.updateStatus(requestId, 'approved', connection);

      // 2. Create the new DRAFT lease
      const lease = await leaseModel.findById(request.lease_id, connection);
      const nextStartDate = addDays(parseLocalDate(lease.endDate), 1);
      const nextStartDateStr = formatToLocalDate(nextStartDate);

      // [VALIDATION] Ensure the new lease period is logical
      if (parseLocalDate(request.proposed_end_date) <= nextStartDate) {
        throw new AppError(
          `The proposed renewal end date (${request.proposed_end_date}) must be AFTER the calculated start date (${nextStartDateStr})`,
          400
        );
      }

      // [F2.4] Overlap check before creating renewal lease
      const proposedEndDate =
        request.proposedEndDate || request.proposed_end_date;
      const [overlapping] = await connection.query(
        `SELECT lease_id FROM leases 
         WHERE unit_id = ? 
         AND status IN ('active', 'draft', 'pending')
         AND start_date <= ?
         AND end_date >= ?`,
        [lease.unitId, proposedEndDate, nextStartDateStr]
      );
      if (overlapping.length > 0) {
        throw new AppError(
          `Unit ${lease.unitId} already has an overlapping lease for this period. Renewal cannot proceed.`,
          409
        );
      }

      // [F2.4] Financial Rollover — Move existing deposit to the new lease ledger
      const oldDepositBalance = await leaseModel.getDepositBalance(
        request.lease_id,
        connection
      );

      const targetDeposit =
        request.proposedMonthlyRent || request.proposed_monthly_rent;

      // Create the new active lease with correct financial context
      const newLeaseId = await leaseModel.create(
        {
          tenantId: lease.tenantId,
          unitId: lease.unitId,
          startDate: nextStartDateStr,
          endDate: request.proposedEndDate || request.proposed_end_date,
          monthlyRent:
            request.proposedMonthlyRent || request.proposed_monthly_rent,
          status: 'active',
          // Automatically determine status based on carried balance vs new target
          depositStatus:
            oldDepositBalance >= targetDeposit ? 'paid' : 'pending',
          targetDeposit: targetDeposit,
          documentUrl: lease.documentUrl, // Carry forward from previous lease
          isDocumentsVerified: true,
          signedAt: getLocalTime(),
          reservationExpiresAt: null,
        },
        connection
      );

      // [F2.4] Atomic Ledger Transfer
      if (oldDepositBalance > 0) {
        await connection.query(
          `INSERT INTO accounting_ledger 
           (lease_id, account_type, category, debit, credit, description, entry_date)
           VALUES 
           (?, 'liability', 'deposit_held', ?, 0, ?, ?),
           (?, 'liability', 'deposit_held', 0, ?, ?, ?)`,
          [
            request.lease_id,
            oldDepositBalance,
            `Deposit Rollover to Renewal Lease #${newLeaseId}`,
            nextStartDateStr,
            newLeaseId,
            oldDepositBalance,
            `Deposit Rollover from Previous Lease #${request.lease_id}`,
            nextStartDateStr,
          ]
        );
      }

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

      // Send Email Notification (non-blocking)
      try {
        const tenantUser = await userModel.findById(lease.tenantId);
        const unit = await unitModel.findById(lease.unitId);
        const property = await propertyModel.findById(unit.propertyId);
        if (tenantUser && tenantUser.email) {
          await emailService.sendRenewalApproval(
            tenantUser.email,
            property.name,
            newLeaseId
          );
        }
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

  async reject(requestId, user) {
    const request = await renewalRequestModel.findById(requestId);
    if (!request) throw new AppError('Renewal request not found', 404);

    // RBAC: Treasurer assignment check
    if (user.role === ROLES.TREASURER) {
      const staffModel = (await import('../models/staffModel.js')).default;
      const assigned = await staffModel.getAssignedProperties(user.id);
      if (
        !assigned.some(
          (p) => String(p.property_id) === String(request.property_id)
        )
      ) {
        throw new AppError(
          'Access denied. You are not assigned to this property.',
          403
        );
      }
    }

    await renewalRequestModel.updateStatus(requestId, 'rejected');

    // Reset the lease notice_status
    await leaseModel.update(request.lease_id, { notice_status: 'undecided' });

    await auditLogger.log({
      userId: user.id || user.user_id,
      actionType: 'RENEWAL_REJECTED',
      entityId: requestId,
      entityType: 'renewal_request',
    });

    // Send Email Notification (non-blocking)
    try {
      const lease = await leaseModel.findById(request.lease_id);
      const tenantUser = await userModel.findById(lease.tenantId);
      const unit = await unitModel.findById(lease.unitId);
      const property = await propertyModel.findById(unit.propertyId);
      if (tenantUser && tenantUser.email) {
        await emailService.sendRenewalRejection(
          tenantUser.email,
          property.name,
          null
        );
      }
    } catch (err) {
      console.error('Failed to send renewal rejection email:', err);
    }
  }

  async tenantAccept(requestId, user) {
    const request = await renewalRequestModel.findById(requestId);
    if (!request) throw new AppError('Renewal request not found', 404);

    if (request.status !== 'negotiating') {
      throw new AppError(
        `Cannot accept: renewal is in '${request.status}' status. Terms must be proposed first.`,
        400
      );
    }

    // Ownership check: only the tenant of this lease can accept
    const lease = await leaseModel.findById(
      request.leaseId || request.lease_id
    );
    if (String(lease.tenantId) !== String(user.id)) {
      throw new AppError(
        'Access denied: only the lease tenant can accept renewal terms.',
        403
      );
    }

    // Deadline check
    if (
      request.acceptanceDeadline &&
      new Date() > parseLocalDate(request.acceptanceDeadline)
    ) {
      throw new AppError(
        'The acceptance window for this renewal proposal has expired. Please contact your property manager.',
        400
      );
    }

    await renewalRequestModel.updateStatus(requestId, 'tenant_accepted');

    await auditLogger.log({
      userId: user.id,
      actionType: 'RENEWAL_ACCEPTED_BY_TENANT',
      entityId: requestId,
      entityType: 'renewal_request',
      details: { leaseId: request.leaseId || request.lease_id },
    });

    // Notify Treasurer
    try {
      const [treasurers] = await pool.query(
        'SELECT user_id FROM users WHERE role = ? AND status = "active"',
        [ROLES.TREASURER]
      );
      const notificationModel = (await import('../models/notificationModel.js'))
        .default;
      for (const t of treasurers) {
        await notificationModel.create({
          userId: t.user_id,
          message: `Tenant has accepted renewal terms for Lease #${request.leaseId || request.lease_id} (Unit ${request.unitNumber}). Please proceed with final approval.`,
          type: 'lease_update',
          entityType: 'renewal_request',
          entityId: requestId,
        });
      }
    } catch (err) {
      console.warn(
        '[RENEWAL] Failed to notify treasurers of tenant acceptance:',
        err.message
      );
    }

    return true;
  }

  async tenantDecline(requestId, user) {
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
        'Access denied: only the lease tenant can decline renewal terms.',
        403
      );
    }

    // Keep in 'negotiating' so staff can revise and re-propose
    await renewalRequestModel.updateStatus(requestId, 'negotiating');

    await auditLogger.log({
      userId: user.id,
      actionType: 'RENEWAL_DECLINED_BY_TENANT',
      entityId: requestId,
      entityType: 'renewal_request',
    });

    // Notify Treasurer that tenant declined
    try {
      const [treasurers] = await pool.query(
        'SELECT user_id FROM users WHERE role = ? AND status = "active"',
        [ROLES.TREASURER]
      );
      const notificationModel = (await import('../models/notificationModel.js'))
        .default;
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
      console.warn(
        '[RENEWAL] Failed to notify treasurers of tenant decline:',
        err.message
      );
    }

    return true;
  }

  async instantRenew(leaseId, newEndDate, newMonthlyRent, user) {
    // [PRIVILEGED OVERRIDE] instantRenew is a staff-initiated action used for bulk renewals
    // and owner-directed changes. It deliberately bypasses the tenant_accepted gate.
    // Only available to Owner/Admin roles. Do not route this through the standard approve() path.
    // 1. Create a renewal request from the lease automatically
    const requestId = await this.createFromNotice(leaseId, user);

    const request = await renewalRequestModel.findById(requestId);
    if (request.status === 'approved') {
      throw new AppError('This lease renewal has already been approved.', 409);
    }

    // 2. Propose terms automatically
    await this.proposeTerms(
      requestId,
      {
        proposedMonthlyRent: newMonthlyRent,
        proposedEndDate: newEndDate,
        notes: 'Auto-renewed by property manager.',
      },
      user
    );

    // 3. Approve automatically
    return await this.approve(requestId, user);
  }

  async getRequests(user) {
    if (user.role === ROLES.SYSTEM) {
      return await renewalRequestModel.findAll({});
    }
    if (user.role === ROLES.OWNER)
      return await renewalRequestModel.findAll({ ownerId: user.id });
    if (user.role === ROLES.TREASURER)
      return await renewalRequestModel.findAll({ treasurerId: user.id });
    if (user.role === ROLES.TENANT) {
      // Find renewal requests for this tenant's leases
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
  async cancelPendingRenewals(leaseId, connection = null) {
    const db = connection || pool;
    await db.query(
      "UPDATE renewal_requests SET status = 'cancelled' WHERE lease_id = ? AND status IN ('pending', 'negotiating')",
      [leaseId]
    );
    console.log(`[RENEWAL] Cancelled pending requests for Lease #${leaseId}`);
  }
}

export default new RenewalService();
