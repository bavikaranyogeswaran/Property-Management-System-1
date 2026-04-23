// ============================================================================
//  LEASE TERMINATION SERVICE (The Move-Out Manager)
// ============================================================================
//  This service handles the "End" of a tenant's stay:
//  Premature terminations, natural expirations, and the checkout process.
//  It ensures the unit is returned to the pool for the next tenant.
// ============================================================================

import crypto, { randomUUID } from 'crypto';
import leaseModel from '../models/leaseModel.js';
import unitModel from '../models/unitModel.js';
import tenantModel from '../models/tenantModel.js';
import pool from '../config/db.js';
import { acquireLock, releaseLock } from '../config/redis.js';
import invoiceModel from '../models/invoiceModel.js';
import visitModel from '../models/visitModel.js';
import leadModel from '../models/leadModel.js';
import { validateLeaseDuration } from '../utils/validators.js';
import auditLogger from '../utils/auditLogger.js';
import notificationModel from '../models/notificationModel.js';
import userModel from '../models/userModel.js';
import {
  getCurrentDateString,
  getLocalTime,
  today,
  parseLocalDate,
  addDays,
  formatToLocalDate,
  getDaysInMonth,
} from '../utils/dateUtils.js';
import { toCentsFromMajor, moneyMath, fromCents } from '../utils/moneyUtils.js';
import renewalService from './renewalService.js';
import AppError from '../utils/AppError.js';
import { ROLES } from '../utils/roleUtils.js';

class LeaseTerminationService {
  constructor(facade) {
    this.facade = facade;
  }

  // TERMINATE LEASE: Handles an early move-out, potentially charging a fee.
  async terminateLease(
    leaseId,
    terminationDate,
    terminationFee = 0,
    user = null
  ) {
    if (!terminationDate) {
      throw new AppError('Termination date is required.', 400);
    }

    const lockKey = `terminate_lease_${leaseId}`;
    const acquired = await acquireLock(lockKey, 30000);
    if (!acquired) {
      throw new AppError('Lease termination already in progress', 409);
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // [HARDENED] 3. Deterministic Locking Order (Unit -> Lease)
      // Lock Unit first (Parent) then Lease (Child) to prevent deadlocks with Payment flows.
      const baseLease = await leaseModel.findById(leaseId, connection);
      if (!baseLease) throw new AppError('Lease not found', 404);

      if (baseLease.status !== 'active') {
        throw new AppError('Only active leases can be terminated', 400);
      }

      const termDate = parseLocalDate(terminationDate);
      const leaseEnd = parseLocalDate(baseLease.endDate);
      if (termDate > leaseEnd) {
        throw new AppError(
          `Termination date (${terminationDate}) cannot be after the lease's original end date (${baseLease.endDate}).`,
          400
        );
      }

      await unitModel.findByIdForUpdate(baseLease.unitId, connection);
      const lease = await leaseModel.findByIdForUpdate(leaseId, connection);

      const todayDate = getLocalTime();
      const start = parseLocalDate(lease.startDate);

      // 4. Branch Logic: Pre-start Cancellation vs Active Termination
      if (todayDate < start) {
        // [SIDE EFFECT] Move to 'cancelled' status directly
        await leaseModel.update(
          leaseId,
          { status: 'cancelled', endDate: terminationDate },
          connection
        );
        await invoiceModel.voidAllPendingByLeaseId(leaseId, connection);
        await this.facade._syncUnitStatus(lease.unitId, connection);
      } else {
        // 5. Active Termination Logic
        if (terminationFee > 0) {
          // [SIDE EFFECT] Generate termination penalty invoice
          await invoiceModel.create(
            {
              leaseId,
              amount: terminationFee,
              dueDate: formatToLocalDate(addDays(today(), 5)),
              description: 'Early Termination Fee',
              type: 'late_fee',
            },
            connection
          );
        }

        // 6. Update lease to 'ended' status
        await leaseModel.update(
          leaseId,
          { status: 'ended', endDate: terminationDate },
          connection
        );
        await invoiceModel.voidAllPendingByLeaseId(leaseId, connection);

        // 7. [SIDE EFFECT] Mark unit for maintenance (turnover phase)
        await unitModel.update(
          lease.unitId,
          { status: 'maintenance', isTurnoverCleared: false },
          connection
        );

        // [SIDE EFFECT] Auto-close non-invoiced open maintenance requests
        await connection.query(
          "UPDATE maintenance_requests SET status = 'closed' WHERE tenant_id = ? AND unit_id = ? AND status IN ('submitted', 'in_progress')",
          [lease.tenantId, lease.unitId]
        );
      }

      // 8. [AUDIT] Log the termination event
      await auditLogger.log(
        {
          userId: user?.id || user?.user_id || null,
          actionType: 'LEASE_TERMINATION',
          entityId: leaseId,
          entityType: 'lease',
          details: { terminationDate, status: lease.status },
        },
        null,
        connection
      );

      // 9. [SIDE EFFECT] Notify tenant and treasurers (Refund required alert)
      await notificationModel.create(
        {
          userId: lease.tenantId,
          message: `Your lease for Unit has been terminated effective ${terminationDate}.`,
          type: 'lease',
          severity: 'warning',
          entityType: 'lease',
          entityId: leaseId,
        },
        connection
      );

      const treasurers = await userModel.findByRole(ROLES.TREASURER);
      for (const t of treasurers) {
        await notificationModel.create(
          {
            userId: t.user_id,
            message: `Lease #${leaseId} terminated. Process Security Deposit Refund.`,
            type: 'lease',
            severity: 'warning',
            entityType: 'lease',
            entityId: leaseId,
          },
          connection
        );
      }

      await connection.commit();
      return {
        status: todayDate < start ? 'cancelled' : 'ended',
        terminationDate,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
      await releaseLock(lockKey);
    }
  }

  // FINALIZE CHECKOUT: The very last step. Confirms the tenant has left and the keys are back.
  async finalizeLeaseCheckout(leaseId, user) {
    // 1. Fetch lease and validate status eligibility
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new AppError('Lease not found', 404);

    if (lease.status !== 'expired' && lease.status !== 'ended') {
      throw new AppError(
        'Only expired or ended leases can be finalized for checkout',
        400
      );
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // [HARDENED] 2. Deterministic Locking Order (Unit -> Lease)
      await unitModel.findByIdForUpdate(lease.unitId, connection);
      await leaseModel.findByIdForUpdate(leaseId, connection);

      const today = getLocalTime();
      const actualCheckoutAt = today
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');

      // 3. Update lease: record actual checkout timestamp
      const updateData = { actualCheckoutAt };
      if (lease.status === 'expired') {
        updateData.status = 'ended';
      }
      await leaseModel.update(leaseId, updateData, connection);

      // 4. [SIDE EFFECT] Resolve Unit Status based on future leases
      await this.facade._syncUnitStatus(lease.unitId, connection);

      // 5. [AUDIT] Log checkout finalization
      await auditLogger.log(
        {
          userId: user.id || user.user_id,
          actionType: 'LEASE_CHECKOUT_FINALIZED',
          entityId: leaseId,
          entityType: 'lease',
          details: { actualCheckoutAt, unitId: lease.unitId },
        },
        null,
        connection
      );

      await connection.commit();
      return { status: 'ended', actualCheckoutAt };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // CANCEL LEASE: Deletes a Draft or Pending lease if the deal falls through.
  async cancelLease(leaseId, user) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. [HARDENED] Deterministic Locking Order (Unit -> Lease)
      const baseLease = await leaseModel.findById(leaseId, conn);
      if (!baseLease) throw new AppError('Lease not found', 404);

      // 2. Lock Parent (Unit) first
      const unitLock = await unitModel.findByIdForUpdate(
        baseLease.unitId,
        conn
      );
      if (!unitLock) throw new AppError('Unit reference not found.', 404);

      // 3. Lock Child (Lease) second
      const lease = await leaseModel.findByIdForUpdate(leaseId, conn);
      if (!lease) throw new AppError('Lease reference not found.', 404);

      // [SECURITY] manual cancellation restricted to non-active leases
      if (['active', 'expired', 'ended'].includes(baseLease.status)) {
        throw new AppError(
          'Only draft or pending leases can be cancelled manually. Use termination flow for active leases.',
          400
        );
      }

      // 4. Update status to 'cancelled'
      await leaseModel.update(leaseId, { status: 'cancelled' }, conn);

      // 5. [FINANCIAL] Detect Trapped Deposits: Alert for refund processing
      if (lease.depositStatus === 'paid') {
        await leaseModel.update(
          leaseId,
          {
            proposedRefundAmount: lease.targetDeposit,
            refundNotes:
              'Auto-queued: Lease application cancelled by staff after deposit payment.',
          },
          conn
        );

        const treasurers = await userModel.findByRole(ROLES.TREASURER);
        for (const t of treasurers) {
          await notificationModel.create(
            {
              userId: t.user_id,
              message: `Refund Alert: Lease #${leaseId} was cancelled by staff. A paid deposit of ${fromCents(lease.targetDeposit)} is trapped and needs processing.`,
              type: 'lease',
              severity: 'urgent',
              entityType: 'lease',
              entityId: leaseId,
            },
            conn
          );
        }
      }

      // 6. [CLEANUP] Clear magic links
      await conn.query(
        'UPDATE rent_invoices SET magic_token_hash = NULL, magic_token_expires_at = NULL WHERE lease_id = ?',
        [leaseId]
      );

      // 7. [SIDE EFFECT] Release unit reservation lock
      await this.facade._syncUnitStatus(lease.unitId, conn);

      // 8. [AUDIT] Log cancellation
      await auditLogger.log(
        {
          userId: user.id || user.user_id,
          actionType: 'LEASE_CANCELLED_BY_STAFF',
          entityId: leaseId,
          entityType: 'lease',
          details: { unitId: lease.unitId },
        },
        null,
        conn
      );

      await conn.commit();
      return true;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  // WITHDRAW APPLICATION: The "Change of Heart" logic. When a prospect decides they don't want the unit anymore.
  async withdrawApplication(leaseId, user) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. [HARDENED] Deterministic Locking Order (Unit -> Lease)
      const baseLease = await leaseModel.findById(leaseId, conn);
      if (!baseLease) throw new AppError('Lease not found', 404);

      // 2. Lock Parent (Unit) first
      const unitLock = await unitModel.findByIdForUpdate(
        baseLease.unitId,
        conn
      );
      if (!unitLock) throw new AppError('Unit reference not found.', 404);

      // 3. Lock Child (Lease) second
      const lease = await leaseModel.findByIdForUpdate(leaseId, conn);
      if (!lease) throw new AppError('Lease reference not found.', 404);

      // [SECURITY] Ownership check: must be the tenant withdrawing their own app
      if (String(lease.tenantId) !== String(user.id)) {
        throw new AppError(
          'Access denied: You can only withdraw your own application.',
          403
        );
      }

      // [SECURITY] Rule: Withdrawals restricted to draft phase
      if (lease.status !== 'draft') {
        throw new AppError(
          'Applications can only be withdrawn while in draft status. Use termination flow for active leases.',
          400
        );
      }

      // 4. Perform cancellation
      await leaseModel.update(leaseId, { status: 'cancelled' }, conn);

      // 5. [FINANCIAL] Refund Alert: Paid deposit must be returned if prospect withdraws
      if (lease.depositStatus === 'paid') {
        await leaseModel.update(
          leaseId,
          {
            proposedRefundAmount: lease.targetDeposit,
            refundNotes:
              'Auto-queued: Prospect withdrew application after deposit payment.',
          },
          conn
        );

        const treasurers = await userModel.findByRole(ROLES.TREASURER);
        for (const t of treasurers) {
          await notificationModel.create(
            {
              userId: t.user_id,
              message: `Refund Alert: Prospect withdrew application for Lease #${leaseId}. A paid deposit of ${fromCents(lease.targetDeposit)} is trapped and needs processing.`,
              type: 'lease',
              severity: 'urgent',
              entityType: 'lease',
              entityId: leaseId,
            },
            conn
          );
        }
      }

      // 6. [CLEANUP] Kill magic links and release unit lock
      await conn.query(
        'UPDATE rent_invoices SET magic_token_hash = NULL, magic_token_expires_at = NULL WHERE lease_id = ?',
        [leaseId]
      );
      await this.facade._syncUnitStatus(lease.unitId, conn);

      // 7. [AUDIT] Log the withdrawal event
      await auditLogger.log(
        {
          userId: user.id || user.user_id,
          actionType: 'LEASE_WITHDRAWN_BY_TENANT',
          entityId: leaseId,
          entityType: 'lease',
          details: { unitId: lease.unitId },
        },
        null,
        conn
      );

      await conn.commit();
      return true;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  // PROCESS AUTOMATED ESCALATIONS: A scheduled cleanup task that handles annual rent increases.
  async processAutomatedEscalations() {
    // 1. Identify all leases crossing their anniversary date today
    const targetDate = today();
    const leases = await leaseModel.findLeasesNeedingEscalation(targetDate);

    const results = [];
    for (const lease of leases) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const currentRent = Number(lease.monthly_rent);
        const percentage = Number(lease.escalation_percentage);

        // [HARDENED] 2. Precise Decimal Calculation (Compounding increase)
        const newRent = moneyMath(currentRent)
          .mul(1 + percentage / 100)
          .round()
          .value();

        // 3. Record historical adjustment and update lease record
        await conn.query(
          'INSERT INTO lease_rent_adjustments (lease_id, effective_date, new_monthly_rent, notes) VALUES (?, ?, ?, ?)',
          [
            lease.lease_id,
            targetDate,
            newRent,
            `Automated ${percentage}% escalation applied.`,
          ]
        );

        await leaseModel.update(
          lease.lease_id,
          {
            monthlyRent: newRent,
            lastEscalation_date: targetDate,
          },
          conn
        );

        // 4. [SIDE EFFECT] Notify tenant and log system audit
        await notificationModel.create(
          {
            userId: lease.tenant_id,
            message: `Scheduled Rent Adjustment: Your monthly rent has been adjusted to LKR ${fromCents(newRent).toLocaleString()} effective today.`,
            type: 'lease_update',
            entityType: 'lease',
            entityId: lease.lease_id,
          },
          conn
        );

        await auditLogger.log(
          {
            userId: null, // System action
            actionType: 'RENT_ESCALATED_AUTOMATED',
            entityId: lease.lease_id,
            entityType: 'lease',
            details: { oldRent: currentRent, newRent, percentage },
          },
          null,
          conn
        );

        await conn.commit();
        results.push({ leaseId: lease.lease_id, status: 'success', newRent });
      } catch (err) {
        await conn.rollback();
        results.push({
          leaseId: lease.lease_id,
          status: 'failed',
          error: err.message,
        });
      } finally {
        conn.release();
      }
    }
    return results;
  }

  // UPDATE NOTICE STATUS: Records the tenant's intent (Renew vs Vacate) at lease end.
  async updateNoticeStatus(leaseId, status, user) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Ownership & Authorization checks
      const lease = await leaseModel.findById(leaseId, connection);
      if (!lease) throw new AppError('Lease not found', 404);
      if (
        user.role === ROLES.TENANT &&
        String(lease.tenantId) !== String(user.id)
      )
        throw new AppError('Access denied', 403);

      // 2. Perform the update
      if (!['undecided', 'vacating', 'renewing'].includes(status))
        throw new AppError('Invalid notice status', 400);

      await leaseModel.update(leaseId, { noticeStatus: status }, connection);

      // 3. [SIDE EFFECT] Clean up pending renewals if tenant decides to vacate
      if (status === 'vacating') {
        await renewalService.cancelPendingRenewals(leaseId, connection);
      }

      await connection.commit();

      // 4. [SIDE EFFECT] Trigger Negotiated Renewal Flow if renewing
      // Run outside transaction since it's idempotent and handles its own errors
      if (status === 'renewing' && lease.status === 'active' && lease.endDate) {
        await renewalService.createFromNotice(leaseId, user);
      }

      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export default LeaseTerminationService;
