// ============================================================================
//  LEASE CREATION SERVICE (The Contract Architect)
// ============================================================================
//  This service specializes in the first chapter of a tenant's journey:
//  Drafting the lease, checking unit availability, and handling the deposit
//  payment and document verification steps to activate the contract.
// ============================================================================

import crypto, { randomUUID } from 'crypto';
import leaseModel from '../models/leaseModel.js';
import unitModel from '../models/unitModel.js';
import tenantModel from '../models/tenantModel.js';
import pool from '../config/db.js';
import invoiceModel from '../models/invoiceModel.js';
import visitModel from '../models/visitModel.js';
import leadModel from '../models/leadModel.js';
import { validateLeaseDuration } from '../utils/validators.js';
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
import auditLogger from '../utils/auditLogger.js';
import userModel from '../models/userModel.js';

import emailService from '../utils/emailService.js';
import billingEngine from '../utils/billingEngine.js';
import userService from './userService.js';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';
import redis from '../config/redis.js';
import { LEASE_STATUS, UNIT_STATUS } from '../utils/statusConstants.js';

class LeaseCreationService {
  constructor(facade) {
    this.facade = facade;
  }

  // CREATE LEASE: The foundation. Checks if a unit is free and creates a "Draft" contract.
  async createLease(data, connection = null, user = null) {
    // 1. Extract input parameters
    const {
      tenantId,
      unitId,
      startDate,
      endDate,
      monthlyRent,
      targetDeposit,
      documentUrl,
    } = data;

    // 2. [VALIDATION] Prevent invalid or incomplete data from reaching the DB
    if (
      !tenantId ||
      !unitId ||
      !startDate ||
      !endDate ||
      monthlyRent === undefined ||
      monthlyRent === null
    ) {
      throw new AppError('All fields are required for lease creation.', 400);
    }

    if (parseLocalDate(startDate) >= parseLocalDate(endDate)) {
      throw new AppError('End date must be after start date', 400);
    }

    const durationCheck = validateLeaseDuration(startDate, endDate);
    if (!durationCheck.isValid) {
      throw new AppError(durationCheck.error, 400);
    }

    if (monthlyRent <= 0) {
      throw new AppError('Monthly rent must be greater than 0', 400);
    }

    const isOwnTransaction = !connection;
    const conn = connection || (await pool.getConnection());

    try {
      if (isOwnTransaction) await conn.beginTransaction();

      // 3. Verify tenant existence
      const tenant = await tenantModel.findByUserId(tenantId, conn);
      if (!tenant) throw new AppError('Tenant not found', 404);

      // 4. [CONCURRENCY] Lock the unit for atomic status check
      const unit = await unitModel.findByIdForUpdate(unitId, conn);
      if (!unit) throw new AppError('Unit not found', 404);

      // [SECURITY] Block leasing for maintenance or inactive units
      if (unit.status === UNIT_STATUS.MAINTENANCE) {
        throw new AppError('Unit is currently under maintenance.', 409);
      }
      if (unit.status === UNIT_STATUS.INACTIVE) {
        throw new AppError('Unit is no longer available (inactive).', 409);
      }

      // [SECURITY] Block leasing in inactive buildings
      if (unit.propertyStatus === 'inactive' || unit.propertyArchived) {
        throw new AppError(
          `Building (${unit.propertyName}) is inactive or archived.`,
          409
        );
      }

      // 5. [SECURITY] Atomic Overlap Check to prevent double-leasing
      const hasOverlap = await leaseModel.checkOverlap(
        unitId,
        startDate,
        endDate,
        null,
        conn
      );
      if (hasOverlap) {
        throw new AppError(
          'Unit is already leased for the selected dates.',
          409
        );
      }

      // 6. Create the Lease record in 'draft' state
      const leaseParams = {
        tenantId,
        unitId,
        startDate,
        endDate,
        monthlyRent: Number(monthlyRent),
        status: 'draft',
        targetDeposit: Number(targetDeposit || 0),
        documentUrl: documentUrl || null,
        leaseTermId: data.leaseTermId || null,
        reservationExpiresInDays: 2,
      };

      const leaseId = await leaseModel.create(leaseParams, conn);

      // 7. [SIDE EFFECT] Hold the unit status to 'reserved'
      await unitModel.update(unitId, { status: 'reserved' }, conn);

      // 8. Generate Security Deposit Invoice and Magic Link
      let rawToken = null;
      if (leaseParams.targetDeposit > 0) {
        rawToken = randomUUID();
        const tokenHash = crypto
          .createHash('sha256')
          .update(rawToken)
          .digest('hex');
        const expiresAt = formatToLocalDate(addDays(today(), 7));

        await invoiceModel.create(
          {
            leaseId,
            amount: leaseParams.targetDeposit,
            dueDate: formatToLocalDate(addDays(today(), 7)),
            description: 'Security Deposit',
            type: 'deposit',
            magicTokenHash: tokenHash,
            magicTokenExpiresAt: expiresAt,
          },
          conn
        );
      }

      // 9. [AUDIT] Log creation for staff history
      await this._safelyExecute('LEASE_CREATED_DRAFT Audit', async () => {
        await auditLogger.log(
          {
            userId: user?.id || user?.user_id || null,
            actionType: 'LEASE_CREATED_DRAFT',
            entityId: leaseId,
            entityType: 'lease',
            details: { ...leaseParams },
          },
          null,
          conn
        );
      });

      if (isOwnTransaction) await conn.commit();
      return { leaseId, magicToken: rawToken };
    } catch (error) {
      if (isOwnTransaction) {
        await conn.rollback();
      }
      throw error;
    } finally {
      if (isOwnTransaction) {
        conn.release();
      }
    }
  }

  // VERIFY DOCUMENTS: Staff review step. Marks the tenant's paperwork as valid.
  async verifyLeaseDocuments(leaseId, user) {
    // 1. [RACE CONDITION] distributed lock to prevent double activation
    const lockKey = `dist_lock:lease_activation:${leaseId}`;
    const lockToken = await redis.acquireLock(lockKey, 30000);
    if (!lockToken) {
      throw new AppError('Lease is being processed. Try again in 30s.', 409);
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 2. [CONCURRENCY] Lock Hierarchy (Unit -> Lease)
      const baseLease = await leaseModel.findById(leaseId, connection);
      if (!baseLease) throw new AppError('Lease not found', 404);

      await unitModel.findByIdForUpdate(baseLease.unitId, connection);
      const lease = await leaseModel.findByIdForUpdate(leaseId, connection);
      if (!lease) throw new AppError('Lease not found', 404);

      if (lease.status !== 'draft' && lease.status !== 'active') {
        throw new AppError(
          'Only draft leases can have documents verified',
          400
        );
      }

      // 3. [IDEMPOTENCY] Exit if already verified
      if (lease.verificationStatus === 'verified') {
        return {
          isDocumentsVerified: true,
          activated: lease.status === 'active',
          message: 'Documents already verified.',
        };
      }

      // 4. Update verification status
      await leaseModel.update(
        leaseId,
        {
          isDocumentsVerified: true,
          verificationStatus: 'verified',
          verificationRejectionReason: null,
        },
        connection
      );

      // 5. [AUDIT] Log verification
      await this._safelyExecute('LEASE_DOCUMENTS_VERIFIED Audit', async () => {
        await auditLogger.log(
          {
            userId: user.id || user.user_id,
            actionType: 'LEASE_DOCUMENTS_VERIFIED',
            entityId: leaseId,
            entityType: 'lease',
            details: {},
          },
          null,
          connection
        );
      });

      // 6. AUTO-ACTIVATION check: If deposit is paid, sign now.
      const depositStats = await leaseModel.getDepositStatus(
        leaseId,
        connection
      );

      let activated = false;
      let activationWarning = null;

      if (depositStats && depositStats.isFullyPaid) {
        try {
          // [SIDE EFFECT] Trigger activation sequence
          await this.signLease(leaseId, user, connection);
          activated = true;
        } catch (actErr) {
          activationWarning = actErr.message;
        }
      }

      await connection.commit();

      // 7. [SIDE EFFECT] Trigger system onboarding for activated tenants
      if (activated) {
        await this._safelyExecute('TRIGGER_ONBOARDING', async () => {
          await userService.triggerOnboarding(lease.tenantId);
        });
      }

      return {
        isDocumentsVerified: true,
        activated,
        message: 'Documents verified successfully.',
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
      await redis.releaseLock(lockKey, lockToken);
    }
  }

  // REJECT DOCUMENTS: Sends the tenant back to the drawing board if their papers are wrong.
  async rejectLeaseDocuments(leaseId, reason, user) {
    // 1. Validation
    if (!reason) throw new AppError('Rejection reason is required', 400);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 2. [CONCURRENCY] Lock Hierarchy
      const baseLease = await leaseModel.findById(leaseId, connection);
      if (!baseLease) throw new AppError('Lease not found', 404);

      await unitModel.findByIdForUpdate(baseLease.unitId, connection);
      const lease = await leaseModel.findByIdForUpdate(leaseId, connection);
      if (!lease) throw new AppError('Lease not found', 404);

      if (lease.status !== 'draft')
        throw new AppError(
          'Only draft leases can have documents rejected',
          400
        );

      // 3. Mark as rejected to allow fresh uploads
      await leaseModel.update(
        leaseId,
        {
          isDocumentsVerified: false,
          verificationStatus: 'rejected',
          verificationRejectionReason: reason,
        },
        connection
      );

      // 4. [AUDIT] Log rejection
      await this._safelyExecute('LEASE_DOCUMENTS_REJECTED Audit', async () => {
        await auditLogger.log(
          {
            userId: user.id || user.user_id,
            actionType: 'LEASE_DOCUMENTS_REJECTED',
            entityId: leaseId,
            entityType: 'lease',
            details: { reason },
          },
          null,
          connection
        );
      });

      await connection.commit();
      return { verificationStatus: 'rejected' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // SIGN LEASE: The final activation. Moves the lease from "Draft" to "Active" and the unit to "Occupied".
  async signLease(leaseId, user, connection = null) {
    // 1. [RACE CONDITION] Acquire distributed lock
    const lockKey = `dist_lock:lease_activation:${leaseId}`;
    const isOwnTransaction = !connection;
    let lockToken = null;

    if (isOwnTransaction) {
      lockToken = await redis.acquireLock(lockKey, 30000);
      if (!lockToken) throw new AppError('Activation in progress.', 409);
    }

    const conn = connection || (await pool.getConnection());

    try {
      if (isOwnTransaction) await conn.beginTransaction();

      // 2. [CONCURRENCY] Lock Parent (Unit) first
      const baseLease = await leaseModel.findById(leaseId, conn);
      if (!baseLease) throw new AppError('Lease not found', 404);

      const unit = await unitModel.findByIdForUpdate(baseLease.unitId, conn);
      if (!unit || unit.status === 'inactive')
        throw new AppError('Unit unavailable.', 409);

      // [SECURITY] Block activation if building is offline
      if (unit.propertyStatus === 'inactive' || unit.propertyArchived) {
        throw new AppError(
          `Building (${unit.propertyName}) is inactive or archived.`,
          409
        );
      }

      // 3. [CONCURRENCY] Lock Child (Lease) second
      const lease = await leaseModel.findByIdForUpdate(leaseId, conn);
      if (!lease) throw new AppError('Lease not found', 404);

      // [IDEMPOTENCY] Skip if already active
      if (lease.status === 'active' || lease.status === 'pending') {
        if (isOwnTransaction) await conn.commit();
        return {
          status: lease.status,
          signedAt: lease.signedAt || getLocalTime(),
          alreadyActivated: true,
        };
      }

      // 4. Integrity Checks: Status and Availability
      if (lease.status !== 'draft')
        throw new AppError('Only draft leases can be signed', 400);
      if (unit.status === 'maintenance')
        throw new AppError('Unit is under maintenance.', 409);
      if (!unit.isTurnoverCleared)
        throw new AppError('Unit pending turnover clearance.', 400);

      const hasOverlap = await leaseModel.checkOverlap(
        lease.unitId,
        lease.startDate,
        lease.endDate,
        leaseId,
        conn
      );
      if (hasOverlap)
        throw new AppError('Unit is already leased for these dates.', 409);

      // 5. [FINANCIAL] Final verification of Security Deposit funds
      const depositStats = await leaseModel.getDepositStatus(leaseId, conn);
      if (depositStats && !depositStats.isFullyPaid) {
        throw new AppError(
          `Deposit not fully paid. Balance: LKR ${fromCents(depositStats.paidAmount)}.`,
          400
        );
      }

      // 6. [SECURITY] Final validation of Staff Evidence verification
      if (!lease.isDocumentsVerified)
        throw new AppError('Documents not verified by staff.', 400);

      // 7. Transition to 'active' or 'pending' (if future start date)
      const isFutureLease = parseLocalDate(lease.startDate) > getLocalTime();
      const initialStatus = isFutureLease ? 'pending' : 'active';

      await leaseModel.update(
        leaseId,
        {
          status: initialStatus,
          signedAt: getLocalTime(),
          reservationExpiresAt: { sql: 'NULL' },
        },
        conn
      );

      // 8. [CLEANUP] Kill Magic Guest Links
      try {
        const [invs] = await conn.query(
          'SELECT invoice_id FROM rent_invoices WHERE lease_id = ? AND magic_token_hash IS NOT NULL',
          [leaseId]
        );
        for (const inv of invs)
          await invoiceModel.clearMagicToken(inv.invoice_id, conn);
      } catch (tokenErr) {
        console.warn('Token cleanup failed', tokenErr.message);
      }

      // 9. [SIDE EFFECT] Activate physical unit and convert leads
      await visitModel.cancelVisitsForUnit(lease.unitId, today(), conn);

      if (parseLocalDate(lease.startDate) <= getLocalTime()) {
        await unitModel.update(lease.unitId, { status: 'occupied' }, conn);

        // Convert Lead record to 'converted' automatically
        try {
          const tenantUser = await userModel.findById(lease.tenantId, conn);
          if (tenantUser?.email) {
            const [matchingLeads] = await conn.query(
              `SELECT lead_id FROM leads 
               WHERE (LOWER(TRIM(email)) = LOWER(TRIM(?)) OR (unit_id = ? AND status = 'interested')) 
               AND property_id = ? AND status = 'interested' LIMIT 1`,
              [
                tenantUser.email,
                unit.unitId || unit.unit_id,
                unit.propertyId || unit.property_id,
              ]
            );
            if (matchingLeads.length > 0)
              await leadModel.update(
                matchingLeads[0].lead_id,
                { status: 'converted' },
                conn
              );
          }
        } catch (err) {
          console.error('Lead conversion failed', err);
        }

        await leadModel.dropLeadsForUnit(lease.unitId, conn);
      }

      // 10. [OPERATIONAL] Backfill missing Rent Invoices if activated late
      try {
        const start = parseLocalDate(lease.startDate);
        let cursorDate = new Date(start.getFullYear(), start.getMonth(), 1);
        const targetDate = new Date(
          getLocalTime().getFullYear(),
          getLocalTime().getMonth(),
          1
        );

        while (cursorDate <= targetDate) {
          const billingInfo = billingEngine.calculateMonthlyRent(
            lease,
            cursorDate.getFullYear(),
            cursorDate.getMonth() + 1
          );
          if (billingInfo) {
            const exists = await invoiceModel.exists(
              lease.id,
              cursorDate.getFullYear(),
              cursorDate.getMonth() + 1,
              'rent',
              conn
            );
            if (!exists) {
              await invoiceModel.create(
                {
                  leaseId: lease.id,
                  amount: billingInfo.amount,
                  dueDate: billingInfo.dueDate,
                  description: billingInfo.description,
                  type: 'rent',
                },
                conn
              );
            }
          }
          cursorDate.setMonth(cursorDate.getMonth() + 1);
        }
      } catch (backfillErr) {
        logger.error('Rent backfill failed', { error: backfillErr.message });
      }

      // 11. [AUDIT] Log final activation
      await this._safelyExecute('LEASE_SIGNED_ACTIVATED Audit', async () => {
        await auditLogger.log(
          {
            userId: user?.id || user?.user_id || null,
            actionType: 'LEASE_SIGNED_ACTIVATED',
            entityId: leaseId,
            entityType: 'lease',
            details: {},
          },
          null,
          conn
        );
      });

      if (isOwnTransaction) {
        await conn.commit();
        conn.release();
      }

      // [SIDE EFFECT] Notify dropped leads of unit unavailability
      if (parseLocalDate(lease.startDate) <= getLocalTime()) {
        await this._safelyExecute('Notify Dropped Leads', async () => {
          const [droppedLeads] = await pool.query(
            `SELECT l.email, l.name, u.unit_number, p.name AS property_name FROM leads l JOIN units u ON l.unit_id = u.unit_id JOIN properties p ON l.property_id = p.property_id WHERE l.unit_id = ? AND l.status = 'dropped' AND l.notes LIKE '%Unit Leased%'`,
            [lease.unitId]
          );
          for (const lead of droppedLeads)
            if (lead.email)
              await emailService.sendGenericNotification(lead.email, {
                subject: `Unit unavailable`,
                message: `Unit ${lead.unit_number} at ${lead.property_name} is no longer available.`,
              });
        });
      }

      return { status: 'active', signedAt: getLocalTime() };
    } catch (error) {
      if (isOwnTransaction) {
        await conn.rollback();
      }
      throw error;
    } finally {
      if (isOwnTransaction) {
        try {
          conn.release();
        } catch (e) {}
        await redis.releaseLock(lockKey, lockToken);
      }
    }
  }

  /**
   * Standard error handler for silent side-effect failures.
   * Ensures non-critical tasks like logging and notifications do not crash core business state.
   */
  // SAFELY EXECUTE: Standard error handler for non-critical silent side-effect failures.
  async _safelyExecute(label, fn) {
    try {
      await fn();
    } catch (err) {
      logger.warn(`[LeaseCreationService] Non-critical failure in ${label}:`, {
        error: err.message,
      });
    }
  }
}

export default LeaseCreationService;
