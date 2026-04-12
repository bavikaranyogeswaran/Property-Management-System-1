import crypto, { randomUUID } from 'crypto';
import leaseModel from '../models/leaseModel.js';
import unitModel from '../models/unitModel.js';
import tenantModel from '../models/tenantModel.js';
import pool from '../config/db.js';
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

class LeaseTerminationService {
  constructor(facade) {
    this.facade = facade;
  }

  async terminateLease(
    leaseId,
    terminationDate,
    terminationFee = 0,
    user = null
  ) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (lease.status !== 'active') {
      throw new Error('Only active leases can be terminated');
    }

    if (!terminationDate) {
      throw new Error('Termination date is required.');
    }
    const termDate = parseLocalDate(terminationDate);
    const leaseEnd = parseLocalDate(lease.endDate);
    if (termDate > leaseEnd) {
      throw new Error(
        `Termination date (${terminationDate}) cannot be after the lease's original end date (${lease.endDate}).`
      );
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const todayDate = getLocalTime();
      const start = parseLocalDate(lease.startDate);

      if (todayDate < start) {
        await leaseModel.update(
          leaseId,
          { status: 'cancelled', endDate: terminationDate },
          connection
        );
        await invoiceModel.voidAllPendingByLeaseId(leaseId, connection);
        await this.facade._syncUnitStatus(lease.unitId, connection);
      } else {
        if (terminationFee > 0) {
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

        await leaseModel.update(
          leaseId,
          { status: 'ended', endDate: terminationDate },
          connection
        );
        await invoiceModel.voidAllPendingByLeaseId(leaseId, connection);
        await unitModel.update(
          lease.unitId,
          { status: 'maintenance', isTurnoverCleared: false },
          connection
        );

        // [C5 FIX] Auto-close non-invoiced open maintenance requests upon lease termination
        await connection.query(
          "UPDATE maintenance_requests SET status = 'closed' WHERE tenant_id = ? AND unit_id = ? AND status IN ('submitted', 'in_progress')",
          [lease.tenantId, lease.unitId]
        );
      }

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

      const treasurers = await userModel.findByRole('treasurer');
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
    }
  }

  async finalizeLeaseCheckout(leaseId, user) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    // [C2 FIX - Problem 2] Accept both 'expired' and 'ended' leases for checkout
    if (lease.status !== 'expired' && lease.status !== 'ended') {
      throw new Error(
        'Only expired or ended leases can be finalized for checkout'
      );
    }

    // Check if security deposit is settled (refunded or offset)
    if (
      !['refunded', 'partially_refunded', 'offset'].includes(
        lease.depositStatus
      )
    ) {
      // We allow finalizing even if not fully refunded, but we should log/warn
      // For this state machine, ending the lease is the final step.
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const today = getLocalTime();
      const actualCheckoutAt = today
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');

      // 1. Update lease: set actual_checkout_at (and status to 'ended' if it was 'expired')
      const updateData = { actualCheckoutAt };
      if (lease.status === 'expired') {
        updateData.status = 'ended';
      }
      await leaseModel.update(leaseId, updateData, connection);

      // 2. Resolve Unit Status Atomically
      await this.facade._syncUnitStatus(lease.unitId, connection);

      // 3. Audit Log
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

  async cancelLease(leaseId, user) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // [HARDENED] Deterministic Locking Order (Unit -> Lease)

      // 1. Initial look up (no lock) to get Unit ID
      const baseLease = await leaseModel.findById(leaseId, conn);
      if (!baseLease) throw new Error('Lease not found');

      // 2. Lock Parent (Unit) first
      const unitLock = await unitModel.findByIdForUpdate(
        baseLease.unitId,
        conn
      );
      if (!unitLock) throw new Error('Unit reference not found.');

      // 3. Lock Child (Lease) second
      const lease = await leaseModel.findByIdForUpdate(leaseId, conn);
      if (!lease) throw new Error('Lease reference not found.');

      if (['active', 'expired', 'ended'].includes(baseLease.status)) {
        throw new Error(
          'Only draft or pending leases can be cancelled manually. Use termination flow for active leases.'
        );
      }

      await leaseModel.update(leaseId, { status: 'cancelled' }, conn);

      // [HARD RESERVATION FIX] Check if unit should go back to available
      // [FIXED] Now uses _syncUnitStatus to account for other future leases correctly
      await this.facade._syncUnitStatus(lease.unitId, conn);

      // [B4 FIX] Added missing auditLogger import
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

  async withdrawApplication(leaseId, user) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // [HARDENED] Deterministic Locking Order (Unit -> Lease)

      // 1. Initial look up (no lock) to get Unit ID
      const baseLease = await leaseModel.findById(leaseId, conn);
      if (!baseLease) throw new Error('Lease not found');

      // 2. Lock Parent (Unit) first
      const unitLock = await unitModel.findByIdForUpdate(
        baseLease.unitId,
        conn
      );
      if (!unitLock) throw new Error('Unit reference not found.');

      // 3. Lock Child (Lease) second
      const lease = await leaseModel.findByIdForUpdate(leaseId, conn);
      if (!lease) throw new Error('Lease reference not found.');

      // Ownership check: must be the tenant
      if (String(lease.tenantId) !== String(user.id)) {
        throw new Error(
          'Access denied: You can only withdraw your own application.'
        );
      }

      if (lease.status !== 'draft') {
        throw new Error(
          'Applications can only be withdrawn while in draft status. Use termination flow for active leases.'
        );
      }

      await leaseModel.update(leaseId, { status: 'cancelled' }, conn);

      // [HARD RESERVATION FIX] Check if unit should go back to available
      // [FIXED] Now uses _syncUnitStatus to account for other future leases correctly
      await this.facade._syncUnitStatus(lease.unitId, conn);

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

  async processAutomatedEscalations() {
    const targetDate = today();
    console.log(`[Escalation] Processing escalations for ${targetDate}...`);

    const leases = await leaseModel.findLeasesNeedingEscalation(targetDate);
    console.log(
      `[Escalation] Found ${leases.length} leases needing escalation.`
    );

    const results = [];
    for (const lease of leases) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const currentRent = Number(lease.monthly_rent);
        const percentage = Number(lease.escalation_percentage);

        // [HARDENED] Precise Decimal Calculation (Compounding)
        // Replaced: Math.round(currentRent * (1 + percentage/100))
        const newRent = moneyMath(currentRent)
          .mul(1 + percentage / 100)
          .round()
          .value();

        // 1. Record the adjustment history
        await conn.query(
          'INSERT INTO lease_rent_adjustments (lease_id, effective_date, new_monthly_rent, notes) VALUES (?, ?, ?, ?)',
          [
            lease.lease_id,
            targetDate,
            newRent,
            `Automated ${percentage}% escalation applied.`,
          ]
        );

        // 2. Update the lease record
        await leaseModel.update(
          lease.lease_id,
          {
            monthlyRent: newRent,
            lastEscalation_date: targetDate, // This confirms the anniversary is handled
          },
          conn
        );

        // 3. Notification Logic

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
        console.log(
          `[Escalation] Successfully escalated Lease #${lease.lease_id} to ${newRent}`
        );
        results.push({ leaseId: lease.lease_id, status: 'success', newRent });
      } catch (err) {
        await conn.rollback();
        console.error(
          `[Escalation] Failed to escalate Lease #${lease.lease_id}:`,
          err
        );
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

  async updateNoticeStatus(leaseId, status, user) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');
    if (user.role === 'tenant' && String(lease.tenantId) !== String(user.id))
      throw new Error('Access denied');
    if (!['undecided', 'vacating', 'renewing'].includes(status))
      throw new Error('Invalid notice status');
    await leaseModel.update(leaseId, { noticeStatus: status });

    // [H11 FIX] Auto-cancel renewals if tenant decides to vacate
    if (status === 'vacating') {
      await renewalService.cancelPendingRenewals(leaseId);
    }

    // [FIX] Negotiated Renewal Flow: Create a renewal request instead of a draft lease
    if (status === 'renewing' && lease.status === 'active' && lease.endDate) {
      await renewalService.createFromNotice(leaseId, user);
      console.log(`[RENEWAL] Created renewal request for Lease ${leaseId}`);
    }

    return true;
  }
}

export default LeaseTerminationService;
