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
import AppError from '../utils/AppError.js';

class LeaseCreationService {
  constructor(facade) {
    this.facade = facade;
  }

  async createLease(data, connection = null, user = null) {
    const {
      tenantId,
      unitId,
      startDate,
      endDate,
      monthlyRent,
      targetDeposit,
      documentUrl, // [ADDED] Document URL
    } = data;

    // Validation (runs before acquiring any connection)
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

    if (!parseLocalDate(startDate) || !parseLocalDate(endDate)) {
      throw new AppError('Invalid date format', 400);
    }

    if (monthlyRent <= 0) {
      throw new AppError('Monthly rent must be greater than 0', 400);
    }

    // If no connection provided, create our own transaction.
    const isOwnTransaction = !connection;
    const conn = connection || (await pool.getConnection());

    try {
      if (isOwnTransaction) {
        await conn.beginTransaction();
      }

      const tenant = await tenantModel.findByUserId(tenantId, conn);
      if (!tenant) {
        throw new AppError('Tenant not found', 404);
      }

      // 1. Check if unit is available (and LOCK it)
      const unit = await unitModel.findByIdForUpdate(unitId, conn);
      if (!unit) {
        throw new AppError('Unit not found', 404);
      }

      // Check unit status - cannot lease units currently under maintenance or trashed
      if (unit.status === 'maintenance') {
        throw new AppError(
          'Unit is currently under maintenance and cannot be leased.',
          409
        );
      }
      // [C2 FIX - Problem 3] Changed 'trashed' → 'inactive' (matches actual ENUM)
      if (unit.status === 'inactive') {
        throw new AppError('Unit is no longer available (inactive).', 409);
      }

      // [PROPERTY STATUS HARDENING] Prevent new draft leases in inactive buildings
      if (unit.propertyStatus === 'inactive' || unit.propertyArchived) {
        throw new AppError(
          `Cannot create lease: The building (${unit.propertyName || 'Property'}) is currently inactive or archived.`,
          409
        );
      }

      // 2a. [REMOVED] Same-tenant overlap check (Supporting Multi-Unit Leases)
      // We no longer block a single tenant from holding multiple active leases
      // across different units or properties. Unit-level availability is still
      // strictly enforced by the check below.

      // 2. Check for Date Overlaps
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

      const leaseParams = {
        tenantId,
        unitId,
        startDate,
        endDate,
        monthlyRent: toCentsFromMajor(monthlyRent),
        status: 'draft',
        targetDeposit: toCentsFromMajor(targetDeposit || 0.0),
        documentUrl: documentUrl || null,
        leaseTermId: data.leaseTermId || null,
        reservationExpiresInDays: 2, // [HARDENED] Use DB-native math
      };

      // 3. Create Lease
      const leaseId = await leaseModel.create(leaseParams, conn);

      // [NEW] Update Unit Status to 'reserved' to hold it
      await unitModel.update(unitId, { status: 'reserved' }, conn);

      // 4. Generate Security Deposit Invoice immediately for the Draft Lease
      // This allows the tenant to pay their "Holding Deposit" before the official signing.
      let rawToken = null;
      if (leaseParams.targetDeposit > 0) {
        rawToken = randomUUID();
        const tokenHash = crypto
          .createHash('sha256')
          .update(rawToken)
          .digest('hex');
        const expiresAt = formatToLocalDate(addDays(today(), 7)); // Increased to 7 days for verification phase

        await invoiceModel.create(
          {
            leaseId,
            amount: leaseParams.targetDeposit,
            dueDate: formatToLocalDate(addDays(today(), 7)), // Due in 7 days to hold the unit
            description: 'Security Deposit',
            type: 'deposit',
            magicTokenHash: tokenHash,
            magicTokenExpiresAt: expiresAt,
          },
          conn
        );

        // Note: The rawToken should be passed to the email service if one was being sent here.
        // Currently, LeaseService doesn't send the email directly in this method,
        // but we've secured the storage.
      }

      // Audit Log
      await auditLogger.log(
        {
          userId: user?.id || user?.user_id || null,
          actionType: 'LEASE_CREATED_DRAFT',
          entityId: leaseId,
          entityType: 'lease',
          details: {
            tenantId,
            unitId,
            startDate,
            endDate,
            monthlyRent,
            targetDeposit: leaseParams.targetDeposit,
          },
        },
        null,
        conn
      );

      if (isOwnTransaction) {
        await conn.commit();
      }

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

  async verifyLeaseDocuments(leaseId, user) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // [CONCURRENCY HARDENING] Lock Hierarchy (Unit -> Lease)
      // Load base lease to get unitId
      const baseLease = await leaseModel.findById(leaseId, connection);
      if (!baseLease) throw new AppError('Lease not found', 404);

      // Lock parent (Unit) first to maintain global hierarchy order
      await unitModel.findByIdForUpdate(baseLease.unitId, connection);

      // Lock child (Lease) second
      const lease = await leaseModel.findByIdForUpdate(leaseId, connection);
      if (!lease) throw new AppError('Lease not found', 404);

      if (lease.status !== 'draft' && lease.status !== 'active') {
        throw new AppError(
          'Only draft leases can have documents verified',
          400
        );
      }

      // [IDEMPOTENCY GUARD] Exit early if already verified to prevent redundant side effects
      if (lease.verificationStatus === 'verified') {
        const depositStats = await leaseModel.getDepositStatus(
          leaseId,
          connection
        );
        return {
          isDocumentsVerified: true,
          activated: lease.status === 'active',
          message:
            lease.status === 'active'
              ? 'Lease is already active and documents are verified.'
              : 'Documents are already verified. Awaiting deposit payment for activation.',
        };
      }

      await leaseModel.update(
        leaseId,
        {
          isDocumentsVerified: true,
          verificationStatus: 'verified',
          verificationRejectionReason: null,
        },
        connection
      );

      // Audit Log
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

      // Check if deposit is already paid. If so, auto-activate now.
      const depositStats = await leaseModel.getDepositStatus(
        leaseId,
        connection
      );
      let activated = false;
      if (depositStats && depositStats.isFullyPaid) {
        await this.facade.signLease(leaseId, user, connection);

        await userService.triggerOnboarding(lease.tenantId, connection);
        activated = true;
      }

      await connection.commit();
      return {
        isDocumentsVerified: true,
        activated,
        message: activated
          ? 'Documents verified and lease activated (deposit was already paid).'
          : 'Documents verified. Awaiting deposit payment for activation.',
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async rejectLeaseDocuments(leaseId, reason, user) {
    if (!reason) {
      throw new AppError('Rejection reason is required', 400);
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // [CONCURRENCY HARDENING] Lock Hierarchy (Unit -> Lease)
      // Load base lease to get unitId
      const baseLease = await leaseModel.findById(leaseId, connection);
      if (!baseLease) throw new AppError('Lease not found', 404);

      // Lock parent (Unit) first
      await unitModel.findByIdForUpdate(baseLease.unitId, connection);

      // Lock child (Lease) second
      const lease = await leaseModel.findByIdForUpdate(leaseId, connection);
      if (!lease) throw new AppError('Lease not found', 404);

      if (lease.status !== 'draft')
        throw new AppError(
          'Only draft leases can have documents rejected',
          400
        );

      await leaseModel.update(
        leaseId,
        {
          isDocumentsVerified: false,
          verificationStatus: 'rejected',
          verificationRejectionReason: reason,
        },
        connection
      );

      // Audit Log
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

      // [HARD RESERVATION FIX] If documents are rejected, we DO NOT automatically cancel the lease
      // to allow the tenant to fix the issue. However, we could release the unit if desired.
      // Keeping it reserved for now as rejection is often just "re-upload clearer images".

      await connection.commit();
      return { verificationStatus: 'rejected' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async signLease(leaseId, user, connection = null) {
    const conn = connection || (await pool.getConnection());
    const isOwnTransaction = !connection;

    try {
      if (isOwnTransaction) {
        await conn.beginTransaction();
      }

      // 1. Initial look up to get Unit ID (no lock)
      const baseLease = await leaseModel.findById(leaseId, conn);
      if (!baseLease) throw new AppError('Lease not found', 404);

      // 2. Lock Parent (Unit) first
      const unit = await unitModel.findByIdForUpdate(baseLease.unitId, conn);
      if (!unit || unit.status === 'inactive') {
        throw new AppError('Unit is no longer available for occupancy.', 409);
      }

      // [PROPERTY STATUS HARDENING] Check parent property status
      if (unit.propertyStatus === 'inactive' || unit.propertyArchived) {
        throw new AppError(
          `Cannot activate lease: The building (${unit.propertyName || 'Property'}) is currently inactive or archived.`,
          409
        );
      }

      // 3. Lock Child (Lease) second
      const lease = await leaseModel.findByIdForUpdate(leaseId, conn);
      if (!lease) throw new AppError('Lease not found', 404);

      // [FIX B] Allow idempotent re-entry — lease may have been activated in a previous
      // crashed transaction that the gateway is retrying.
      if (lease.status === 'active') {
        console.log(
          `[LeaseService] Idempotent signLease: Lease #${leaseId} is already active. Skipping.`
        );
        if (isOwnTransaction) await conn.commit();
        return {
          status: 'active',
          signedAt: lease.signedAt || getLocalTime(),
          alreadyActivated: true,
        };
      }

      if (lease.status !== 'draft')
        throw new AppError('Only draft leases can be signed', 400);

      if (unit.status === 'maintenance') {
        throw new AppError(
          'Unit is currently under maintenance or repair and cannot be leased until cleared by staff.',
          409
        );
      }

      if (!unit.isTurnoverCleared) {
        throw new AppError(
          'Unit is pending turnover clearance. Occupancy is blocked until inspection is complete.',
          400
        );
      }

      const hasOverlap = await leaseModel.checkOverlap(
        lease.unitId,
        lease.startDate,
        lease.endDate,
        leaseId,
        conn
      );
      if (hasOverlap) {
        throw new AppError(
          'Unit is already leased for the selected dates.',
          409
        );
      }

      const todayDate = today();

      // [NEW] Verify Deposit Payment in Ledger before activating
      // This ensures the unit status move to 'occupied' is backed by verified funds.
      const depositStats = await leaseModel.getDepositStatus(leaseId, conn);
      if (depositStats && !depositStats.isFullyPaid) {
        throw new AppError(
          `Cannot activate lease: Security Deposit of LKR ${depositStats.targetAmount.toLocaleString()} is not fully paid. Current ledger balance: LKR ${depositStats.paidAmount.toLocaleString()}.`,
          400
        );
      }

      // [NEW] Verify Documents
      if (!lease.isDocumentsVerified) {
        throw new AppError(
          'Cannot activate lease: Tenant documents have not been verified by staff.',
          400
        );
      }

      await leaseModel.update(
        leaseId,
        {
          status: 'active',
          signedAt: getLocalTime(),
          reservationExpiresAt: { sql: 'NULL' }, // [HARDENED] Clear expiry using DB logic
        },
        conn
      );

      // [D2 FIX] Clear magic tokens for this lease upon activation to kill guest links
      try {
        const [invs] = await conn.query(
          'SELECT invoice_id FROM rent_invoices WHERE lease_id = ? AND magic_token_hash IS NOT NULL',
          [leaseId]
        );
        for (const inv of invs) {
          await invoiceModel.clearMagicToken(inv.invoice_id, conn);
        }
      } catch (tokenErr) {
        console.warn(
          `[LeaseService] Failed to clear magic tokens for Lease #${leaseId}:`,
          tokenErr.message
        );
      }

      await visitModel.cancelVisitsForUnit(lease.unitId, todayDate, conn);

      if (parseLocalDate(lease.startDate) <= getLocalTime()) {
        await unitModel.update(lease.unitId, { status: 'occupied' }, conn);

        try {
          const tenantUser = await userModel.findById(lease.tenantId, conn);
          if (tenantUser?.email) {
            // [HARDENED] Fuzzy Matching for Lead Conversion
            // Use LOWER() and TRIM() to ensure conversion works even with inconsistent user entry.
            const [matchingLeads] = await conn.query(
              `SELECT lead_id, status FROM leads 
               WHERE (LOWER(TRIM(email)) = LOWER(TRIM(?)) OR (unit_id = ? AND status = 'interested')) 
               AND property_id = ? 
               AND status = 'interested' 
               ORDER BY (LOWER(TRIM(email)) = LOWER(TRIM(?))) DESC LIMIT 1`,
              [
                tenantUser.email,
                unit.unitId || unit.unit_id,
                unit.propertyId || unit.property_id,
                tenantUser.email,
              ]
            );
            if (matchingLeads.length > 0) {
              await leadModel.update(
                matchingLeads[0].lead_id,
                { status: 'converted' },
                conn
              );
            }
          }
        } catch (err) {
          console.error('Failed to mark lead as converted:', err);
        }

        await leadModel.dropLeadsForUnit(lease.unitId, conn);

        // [C1 FIX] Notify dropped leads that the unit is no longer available
        try {
          const [droppedLeads] = await conn.query(
            `SELECT l.email, l.name, u.unit_number, p.name AS property_name 
             FROM leads l
             JOIN units u ON l.unit_id = u.unit_id
             JOIN properties p ON l.property_id = p.property_id
             WHERE l.unit_id = ? AND l.status = 'dropped' 
             AND l.notes LIKE '%Unit Leased%'`,
            [lease.unitId]
          );

          for (const lead of droppedLeads) {
            if (lead.email) {
              await emailService
                .sendGenericNotification(lead.email, {
                  subject: `Unit ${lead.unit_number} at ${lead.property_name} is no longer available`,
                  message: `Dear ${lead.name}, Unit ${lead.unit_number} at ${lead.property_name} is no longer available. Please contact us for alternative units.`,
                })
                .catch((err) =>
                  console.error(
                    `Failed to notify dropped lead ${lead.email}:`,
                    err
                  )
                );
            }
          }
        } catch (notifyErr) {
          console.error(
            '[LeaseService] Failed to notify dropped leads:',
            notifyErr
          );
        }
      }

      // [IMPROVEMENT] Backfill Missing Rent Invoices if activated late
      // [RESILIENCE] Wrapped in try/catch to ensure activation isn't blocked by non-critical backfill errors.
      try {
        const start = parseLocalDate(lease.startDate);
        const now = getLocalTime();

        let cursorDate = new Date(start.getFullYear(), start.getMonth(), 1);
        const targetDate = new Date(now.getFullYear(), now.getMonth(), 1);

        while (cursorDate <= targetDate) {
          const y = cursorDate.getFullYear();
          const m = cursorDate.getMonth() + 1;

          const billingInfo = billingEngine.calculateMonthlyRent(lease, y, m);
          if (billingInfo) {
            const exists = await invoiceModel.exists(
              lease.id,
              y,
              m,
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
        console.error(
          `[LeaseService] Automated Rent Backfill failed for Lease #${leaseId}:`,
          backfillErr
        );
        // We do NOT throw here. The lease activation is the priority.
      }

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

      if (isOwnTransaction) {
        await conn.commit();
      }
      return { status: 'active', signedAt: getLocalTime() };
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
}

export default LeaseCreationService;
