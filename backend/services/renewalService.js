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
        user?.role === 'tenant'
          ? 'tenant'
          : user?.role === 'treasurer'
            ? 'staff'
            : 'system', // [H19]
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
    if (user.role === 'treasurer') {
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

    // RBAC: Treasurer assignment check
    if (user.role === 'treasurer') {
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

      // [F2.4] Carry forward deposit status — no new deposit for renewals
      const carriedDepositStatus = [
        'paid',
        'partially_refunded',
        'refunded',
      ].includes(lease.depositStatus)
        ? 'paid'
        : lease.depositStatus || 'not_applicable';

      // [C2 FIX - Problem 1] Auto-activate renewal lease.
      // Renewal tenants are already verified — no deposit or document re-check needed.
      const newLeaseId = await leaseModel.create(
        {
          tenantId: lease.tenantId,
          unitId: lease.unitId,
          startDate: nextStartDateStr,
          endDate: request.proposedEndDate || request.proposed_end_date,
          monthlyRent:
            request.proposedMonthlyRent || request.proposed_monthly_rent,
          status: 'active',
          depositStatus: carriedDepositStatus,
          documentUrl: lease.documentUrl, // Carry forward from previous lease
          isDocumentsVerified: true,
          signedAt: getLocalTime(),
          reservationExpiresAt: null, // Not needed for active lease
        },
        connection
      );

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
    if (user.role === 'treasurer') {
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

  async instantRenew(leaseId, newEndDate, newMonthlyRent, user) {
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
    if (user.role === 'owner')
      return await renewalRequestModel.findAll({ ownerId: user.id });
    if (user.role === 'treasurer')
      return await renewalRequestModel.findAll({ treasurerId: user.id });
    if (user.role === 'tenant') {
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
