import crypto, { randomUUID } from 'crypto';
import leaseModel from '../models/leaseModel.js';
import unitModel from '../models/unitModel.js';
import tenantModel from '../models/tenantModel.js';
import pool from '../config/db.js';
import invoiceModel from '../models/invoiceModel.js';
import visitModel from '../models/visitModel.js';
import leadModel from '../models/leadModel.js';
import { validateLeaseDuration } from '../utils/validators.js';
import { getCurrentDateString, getLocalTime, today, parseLocalDate, addDays, formatToLocalDate, getDaysInMonth } from '../utils/dateUtils.js';
import renewalService from './renewalService.js';

class LeaseService {
  /**
   * Creates a new lease.
   * @param {Object} data - { tenantId, unitId, startDate, endDate, monthlyRent, securityDeposit }
   * @param {Object} [connection] - Optional database connection for transactions
   * @param {Object} [user] - The acting user for audit logging
   * @returns {Promise<number>} - The ID of the created lease
   */
  async createLease(data, connection = null, user = null) {
    const {
      tenantId,
      unitId,
      startDate,
      endDate,
      monthlyRent,
      securityDeposit,
      documentUrl, // [ADDED] Document URL
    } = data;

    // Validation (runs before acquiring any connection)
    if (
      !tenantId ||
      !unitId ||
      !startDate ||
      !endDate ||
      (monthlyRent === undefined || monthlyRent === null)
    ) {
      throw new Error('All fields are required for lease creation.');
    }

    if (parseLocalDate(startDate) >= parseLocalDate(endDate)) {
      throw new Error('End date must be after start date');
    }

    const durationCheck = validateLeaseDuration(startDate, endDate);
    if (!durationCheck.isValid) {
        throw new Error(durationCheck.error);
    }

    if (!parseLocalDate(startDate) || !parseLocalDate(endDate)) {
      throw new Error('Invalid date format');
    }

    if (monthlyRent <= 0) {
      throw new Error('Monthly rent must be greater than 0');
    }

    // If no connection provided, create our own transaction.
    const isOwnTransaction = !connection;
    const conn = connection || await pool.getConnection();

    try {
      if (isOwnTransaction) {
        await conn.beginTransaction();
      }

      const tenant = await tenantModel.findByUserId(tenantId, conn);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // 1. Check if unit is available (and LOCK it)
      const unit = await unitModel.findByIdForUpdate(unitId, conn);
      if (!unit) {
        throw new Error('Unit not found');
      }

      // Check unit status - cannot lease units currently under maintenance or trashed
      if (unit.status === 'maintenance') {
        throw new Error('Unit is currently under maintenance and cannot be leased.');
      }
      if (unit.status === 'trashed') {
        throw new Error('Unit is no longer available (trashed).');
      }

      // 2a. Check for Same-tenant overlap
      const activeLeases = await leaseModel.findByTenantId(tenantId);
      const hasOverlappingActiveLease = activeLeases.some(l => {
        if (l.status !== 'active' && l.status !== 'draft') return false;
        
        const lStart = parseLocalDate(l.startDate);
        const lEnd = l.endDate ? parseLocalDate(l.endDate) : parseLocalDate('2099-12-31');
        const reqStart = parseLocalDate(startDate);
        const reqEnd = endDate ? parseLocalDate(endDate) : parseLocalDate('2099-12-31');
        
        return reqStart <= lEnd && reqEnd >= lStart;
      });

      if (hasOverlappingActiveLease) {
        throw new Error('Tenant already holds an overlapping active or draft lease.');
      }

      // 2. Check for Date Overlaps
      const hasOverlap = await leaseModel.checkOverlap(
        unitId,
        startDate,
        endDate,
        null,
        conn
      );
      if (hasOverlap) {
        throw new Error('Unit is already leased for the selected dates.');
      }

      const leaseParams = {
        tenantId,
        unitId,
        startDate,
        endDate,
        monthlyRent,
        securityDeposit: 0, // Held amount starts at 0. Target is in Invoice.
        status: 'draft',
        targetDeposit: securityDeposit || 0.0,
        documentUrl: documentUrl || null,
        leaseTermId: data.leaseTermId || null,
      };

      // 3. Create Lease
      const leaseId = await leaseModel.create(leaseParams, conn);

      // [NEW] Update Unit Status to 'reserved' to hold it
      await unitModel.update(unitId, { status: 'reserved' }, conn);

      // 4. Generate Security Deposit Invoice immediately for the Draft Lease
      // This allows the tenant to pay their "Holding Deposit" before the official signing.
      if (securityDeposit > 0) {
        const rawToken = randomUUID();
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = formatToLocalDate(addDays(today(), 2)); // 48 hours to pay holding deposit

        await invoiceModel.create({
          leaseId,
          amount: securityDeposit,
          dueDate: formatToLocalDate(addDays(today(), 7)), // Due in 7 days to hold the unit
          description: 'Security Deposit',
          type: 'deposit',
          magicTokenHash: tokenHash,
          magicTokenExpiresAt: expiresAt
        }, conn);
        
        // Note: The rawToken should be passed to the email service if one was being sent here.
        // Currently, LeaseService doesn't send the email directly in this method, 
        // but we've secured the storage.
      }

      // Audit Log
      const auditLogger = (await import('../utils/auditLogger.js')).default;
      await auditLogger.log(
        {
          userId: user?.id || null,
          actionType: 'LEASE_CREATED_DRAFT',
          entityId: leaseId,
          details: { tenantId, unitId, startDate, endDate, monthlyRent, targetDeposit: securityDeposit },
        },
        null,
        conn
      );

      if (isOwnTransaction) {
        await conn.commit();
      }

      return leaseId;
    } catch (error) {
      if (isOwnTransaction) {
        await conn.rollback();
      }
      throw new Error(`Database transaction failed: ${error.message}`);
    } finally {
      if (isOwnTransaction) {
        conn.release();
      }
    }
  }

  /**
   * Manually verifies the tenant's identity/income documents.
   * If the deposit is already fully paid, this will trigger the formal signing and activation.
   */
  async verifyLeaseDocuments(leaseId, user) {
    if (user.role !== 'owner' && user.role !== 'treasurer') {
      throw new Error('Access denied: Only owners or treasurers can verify documents.');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const lease = await leaseModel.findById(leaseId, connection);
      if (!lease) throw new Error('Lease not found');
      if (lease.status !== 'draft') throw new Error('Only draft leases can have documents verified');

      await leaseModel.update(leaseId, { isDocumentsVerified: true }, connection);

      // Audit Log
      const auditLogger = (await import('../utils/auditLogger.js')).default;
      await auditLogger.log({
        userId: user.id,
        actionType: 'LEASE_DOCUMENTS_VERIFIED',
        entityId: leaseId,
        details: { }
      }, null, connection);

      // Check if deposit is already paid. If so, auto-activate now.
      const depositStats = await leaseModel.getDepositStatus(leaseId, connection);
      let activated = false;
      if (depositStats && depositStats.isFullyPaid) {
        await this.signLease(leaseId, user, connection);
        
        const userService = (await import('./userService.js')).default;
        await userService.triggerOnboarding(lease.tenantId, connection);
        activated = true;
      }

      await connection.commit();
      return { isDocumentsVerified: true, activated };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Signs and activates a draft lease.
   */
  async signLease(leaseId, user, connection = null) {
    const conn = connection || await pool.getConnection();
    const isOwnTransaction = !connection;

    try {
      if (isOwnTransaction) {
        await conn.beginTransaction();
      }

      const lease = await leaseModel.findById(leaseId, conn);
      if (!lease) throw new Error('Lease not found');
      if (lease.status !== 'draft') throw new Error('Only draft leases can be signed');

      const unit = await unitModel.findByIdForUpdate(lease.unitId, conn);
      if (!unit || unit.status === 'maintenance' || unit.status === 'trashed') {
         throw new Error('Unit is no longer available for occupancy.');
      }

      const hasOverlap = await leaseModel.checkOverlap(
        lease.unitId,
        lease.startDate,
        lease.endDate,
        leaseId,
        conn
      );
      if (hasOverlap) {
        throw new Error('Unit is already leased for the selected dates.');
      }

      const todayDate = today();

      // [NEW] Verify Deposit Payment in Ledger before activating
      // This ensures the unit status move to 'occupied' is backed by verified funds.
      const depositStats = await leaseModel.getDepositStatus(leaseId, conn);
      if (depositStats && !depositStats.isFullyPaid) {
          throw new Error(`Cannot activate lease: Security Deposit of LKR ${depositStats.targetAmount.toLocaleString()} is not fully paid. Current ledger balance: LKR ${depositStats.paidAmount.toLocaleString()}.`);
      }

      // [NEW] Verify Documents
      if (!lease.isDocumentsVerified) {
        throw new Error('Cannot activate lease: Tenant documents have not been verified by staff.');
      }

      await leaseModel.update(leaseId, { status: 'active', signedAt: getLocalTime() }, conn);

      await visitModel.cancelVisitsForUnit(lease.unitId, todayDate, conn);

      if (parseLocalDate(lease.startDate) <= getLocalTime()) {
        await unitModel.update(lease.unitId, { status: 'occupied' }, conn);

        try {
          const tenantUser = await (await import('../models/userModel.js')).default.findById(lease.tenantId, conn);
          if (tenantUser?.email) {
            const [matchingLeads] = await conn.query(
              `SELECT lead_id, status FROM leads WHERE email = ? AND property_id = ? AND status = 'interested' LIMIT 1`,
              [tenantUser.email, unit.propertyId]
            );
            if (matchingLeads.length > 0) {
              await leadModel.update(matchingLeads[0].lead_id, { status: 'converted' }, conn);
            }
          }
        } catch (err) {
            console.error('Failed to mark lead as converted:', err);
        }
        
        await leadModel.dropLeadsForUnit(lease.unitId, conn);
      }
      
      // [IMPROVEMENT] Backfill Missing Rent Invoices if activated late
      const start = parseLocalDate(lease.startDate);
      const now = getLocalTime();
      const billingEngine = (await import('../utils/billingEngine.js')).default;
      
      let cursorDate = new Date(start.getFullYear(), start.getMonth(), 1);
      const targetDate = new Date(now.getFullYear(), now.getMonth(), 1);

      while (cursorDate <= targetDate) {
          const y = cursorDate.getFullYear();
          const m = cursorDate.getMonth() + 1;
          
          const billingInfo = billingEngine.calculateMonthlyRent(lease, y, m);
          if (billingInfo) {
              const exists = await invoiceModel.exists(lease.id, y, m, 'rent', conn);
              if (!exists) {
                  await invoiceModel.create({
                      leaseId: lease.id,
                      amount: billingInfo.amount,
                      dueDate: billingInfo.dueDate,
                      description: billingInfo.description,
                      type: 'rent'
                  }, conn);
              }
          }
          cursorDate.setMonth(cursorDate.getMonth() + 1);
      }

      const auditLogger = (await import('../utils/auditLogger.js')).default;
      await auditLogger.log(
        {
           userId: user?.id || null,
           actionType: 'LEASE_SIGNED_ACTIVATED',
           entityId: leaseId,
           details: { },
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
      throw new Error(`Transaction failed: ${error.message}`);
    } finally {
      if (isOwnTransaction) {
        conn.release();
      }
    }
  }

  async requestRefund(leaseId, amount, notes, user) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (lease.securityDeposit <= 0) {
      throw new Error('No security deposit available to refund.');
    }

    if (['refunded', 'awaiting_approval'].includes(lease.depositStatus)) {
      throw new Error(`Deposit is already ${lease.depositStatus.replace('_', ' ')}.`);
    }

    if (lease.depositStatus !== 'paid' && lease.depositStatus !== 'partially_refunded') {
      throw new Error('Cannot refund deposit that has not been fully paid.');
    }

    if (amount > lease.securityDeposit) {
      throw new Error('Refund amount cannot exceed security deposit');
    }

    await leaseModel.update(leaseId, {
      depositStatus: 'awaiting_approval',
      proposedRefundAmount: amount,
      refundNotes: notes
    });

    const auditLogger = (await import('../utils/auditLogger.js')).default;
    await auditLogger.log({
      userId: user.id,
      actionType: 'DEPOSIT_REFUND_REQUESTED',
      entityId: leaseId,
      details: { amount, notes },
    });

    return { status: 'awaiting_approval', proposedRefundAmount: amount };
  }

  async approveRefund(leaseId, user) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (!lease.proposedRefundAmount || Number(lease.proposedRefundAmount) <= 0) {
      throw new Error('No refund request awaiting approval.');
    }

    const amount = lease.proposedRefundAmount;
    // Status moves to 'awaiting_acknowledgment' instead of directly to 'refunded'
    const status = 'awaiting_acknowledgment';

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let withheldAmount = lease.securityDeposit - amount;

      if (withheldAmount > 0) {
        const paymentModel = (await import('../models/paymentModel.js')).default;
        const pendingInvoices = await invoiceModel.findPendingDebts(leaseId, connection);

        const invoiceIds = pendingInvoices.map(inv => inv.invoice_id);
        const allPayments = await paymentModel.findByInvoiceIds(invoiceIds, connection);

        const paymentsMap = new Map();
        allPayments.forEach(p => {
          if (!paymentsMap.has(p.invoice_id)) paymentsMap.set(p.invoice_id, []);
          paymentsMap.get(p.invoice_id).push(p);
        });

        for (const inv of pendingInvoices) {
          if (withheldAmount <= 0) break;

          const payments = paymentsMap.get(inv.invoice_id) || [];
          const paidAlready = payments
            .filter((p) => p.status === 'verified')
            .reduce((sum, p) => sum + Number(p.amount), 0);

          const outstanding = inv.amount - paidAlready;
          const toPay = Math.min(withheldAmount, outstanding);

          if (toPay > 0) {
            const payId = await paymentModel.create({
              invoiceId: inv.invoice_id,
              amount: toPay,
              paymentDate: getLocalTime(),
              paymentMethod: 'deposit_offset',
              referenceNumber: `DEP-OFF-${Date.now()}`,
            }, connection);

            await paymentModel.updateStatus(payId, 'verified', null, connection);

            if (toPay >= outstanding) {
              await invoiceModel.updateStatus(inv.invoice_id, 'paid', connection);
            } else {
              await invoiceModel.updateStatus(inv.invoice_id, 'partially_paid', connection);
            }

            const receiptModel = (await import('../models/receiptModel.js')).default;
            await receiptModel.create({
              paymentId: payId,
              invoiceId: inv.invoice_id,
              tenantId: lease.tenantId,
              amount: toPay,
              generatedDate: getLocalTime(),
              receiptNumber: `REC-OFFSET-${randomUUID()}`,
            }, connection);

            const ledgerModel = (await import('../models/ledgerModel.js')).default;
            await ledgerModel.create({
              paymentId: payId,
              invoiceId: inv.invoice_id,
              leaseId: Number(leaseId),
              accountType: 'revenue',
              category: 'rent',
              credit: Number(toPay),
              description: `Deposit offset applied to outstanding invoice #${inv.invoice_id}`,
              entryDate: getCurrentDateString(),
            }, connection);

            await ledgerModel.create({
              paymentId: payId,
              invoiceId: inv.invoice_id,
              leaseId: Number(leaseId),
              accountType: 'liability',
              category: 'deposit_withheld',
              debit: Number(toPay),
              description: `Security deposit withheld for outstanding debt`,
              entryDate: getCurrentDateString(),
            }, connection);

            withheldAmount -= toPay;
          }
        }
      }

      if (withheldAmount > 0) {
        const invId = await invoiceModel.create({
          leaseId,
          amount: withheldAmount,
          dueDate: (() => {
            const d = getLocalTime();
            d.setDate(d.getDate() + 5);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          })(),
          description: `Security Deposit Deductions (Damages/Cleaning): ${lease.refundNotes || ''}`,
          type: 'maintenance',
        }, connection);

        const paymentModel = (await import('../models/paymentModel.js')).default;
        const payId = await paymentModel.create({
          invoiceId: invId,
          amount: withheldAmount,
          paymentDate: getLocalTime(),
          paymentMethod: 'deposit_deduction',
          referenceNumber: `SYS-DEDUCT-${Date.now()}`,
        }, connection);

        await paymentModel.updateStatus(payId, 'verified', null, connection);
        await invoiceModel.updateStatus(invId, 'paid', connection);

        const receiptModel = (await import('../models/receiptModel.js')).default;
        await receiptModel.create({
          paymentId: payId,
          invoiceId: invId,
          tenantId: lease.tenantId,
          amount: withheldAmount,
          generatedDate: getLocalTime(),
          receiptNumber: `REC-DEDUCT-${randomUUID()}`,
        }, connection);

        const ledgerModel = (await import('../models/ledgerModel.js')).default;
        await ledgerModel.create({
          paymentId: payId,
          invoiceId: invId,
          leaseId: Number(leaseId),
          accountType: 'revenue',
          category: 'maintenance',
          credit: Number(withheldAmount),
          description: `Security deposit deduction for damages: ${invId}`,
          entryDate: getCurrentDateString(),
        }, connection);

        await ledgerModel.create({
          paymentId: payId,
          invoiceId: invId,
          leaseId: Number(leaseId),
          accountType: 'liability',
          category: 'deposit_withheld',
          debit: Number(withheldAmount),
          description: `Security deposit withheld for property damages`,
          entryDate: today(),
        }, connection);
      }

      await leaseModel.update(leaseId, {
        refundedAmount: Number(lease.refundedAmount || 0) + Number(amount),
        securityDeposit: 0, // Decrement to zero as it's fully disbursed/withheld
        depositStatus: status,
        proposedRefundAmount: 0
      }, connection);

      const auditLogger = (await import('../utils/auditLogger.js')).default;
      await auditLogger.log({
        userId: user.id,
        actionType: 'DEPOSIT_REFUND_APPROVED',
        entityId: leaseId,
        details: { refundedAmount: amount, status },
      }, null, connection);

      if (amount > 0) {
        const ledgerModel = (await import('../models/ledgerModel.js')).default;
        await ledgerModel.create({
          leaseId: Number(leaseId),
          accountType: 'liability',
          category: 'deposit_refund',
          debit: Number(amount),
          description: `Deposit refund approved by owner: ${amount}`,
          entryDate: today(),
        }, connection);
      }

      await connection.commit();
      return { status, refundedAmount: amount };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async disputeRefund(leaseId, notes, user) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (lease.deposit_status !== 'pending') {
      throw new Error('Only pending refund requests can be disputed.');
    }

    await leaseModel.update(leaseId, {
      depositStatus: 'disputed',
      refundNotes: notes 
    });

    const auditLogger = (await import('../utils/auditLogger.js')).default;
    await auditLogger.log({
      userId: user.id,
      actionType: 'DEPOSIT_REFUND_DISPUTED',
      entityId: leaseId,
      details: { notes },
    });

    return { status: 'disputed' };
  }
  
  /**
   * Tenant acknowledges the refund settlement.
   * This step is mandatory to prevent legal disputes over deductions.
   */
  async acknowledgeRefund(leaseId, tenantId) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');
    
    // Authorization: Only the tenant of this lease can acknowledge
    if (String(lease.tenantId) !== String(tenantId)) {
        throw new Error('Access denied: You are not the tenant of this lease.');
    }

    if (lease.depositStatus !== 'awaiting_acknowledgment') {
      throw new Error('No refund settlement is currently awaiting your acknowledgment.');
    }

    const finalStatus = lease.proposedRefundAmount >= lease.securityDeposit ? 'refunded' : 'partially_refunded';

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await leaseModel.update(leaseId, {
        depositStatus: finalStatus,
        // The security deposit field tracks the "held" balance. 
        // We set it to 0 as it's been disbursed/applied.
        securityDeposit: 0, 
      }, connection);

      const auditLogger = (await import('../utils/auditLogger.js')).default;
      await auditLogger.log({
        userId: tenantId,
        actionType: 'DEPOSIT_REFUND_ACKNOWLEDGED',
        entityId: leaseId,
        details: { status: finalStatus, amount: lease.proposedRefundAmount },
      }, null, connection);

      await connection.commit();
      return { status: finalStatus };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async resolveRefundDispute(leaseId, user) {
    if (user.role !== 'owner' && user.role !== 'treasurer') {
      throw new Error('Access denied');
    }

    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (lease.deposit_status !== 'disputed') {
      throw new Error('Only disputed refunds can be resolved.');
    }

    await leaseModel.update(leaseId, {
      depositStatus: 'pending' // Move back to pending for re-approval
    });

    const auditLogger = (await import('../utils/auditLogger.js')).default;
    await auditLogger.log({
      userId: user.id,
      actionType: 'DEPOSIT_REFUND_RESOLVED',
      entityId: leaseId,
      details: { previousStatus: 'disputed' },
    });

    return { status: 'pending' };
  }

  async refundDeposit(leaseId, amount, user) {
    // This now acts as a shortcut for owners or a request for treasurers
    if (user.role === 'owner') {
      // Owners can directly approve if they want, but usually they'll use approveRefund.
      // For backward compatibility or direct action, we'll make them request then immediately approve?
      // Or just call the request then they can approve later.
      // Re-evaluating: The controller will handle the branching. 
      // LeaseService.refundDeposit is now essentially requestRefund.
      return await this.requestRefund(leaseId, amount, 'Direct refund request', user);
    } else {
      return await this.requestRefund(leaseId, amount, 'Refund request by treasurer', user);
    }
  }

  async terminateLease(leaseId, terminationDate, terminationFee = 0, user = null) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (lease.status !== 'active') {
      throw new Error('Only active leases can be terminated');
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const todayDate = getLocalTime();
      const start = parseLocalDate(lease.startDate);

      if (todayDate < start) {
        await leaseModel.update(leaseId, { status: 'cancelled', endDate: terminationDate }, connection);
        await invoiceModel.voidPendingByLeaseId(leaseId, connection);
        await unitModel.update(lease.unitId, { status: 'available' }, connection);
      } else {
        if (terminationFee > 0) {
          await invoiceModel.create({
            leaseId,
            amount: terminationFee,
            dueDate: formatToLocalDate(addDays(today(), 5)),
            description: 'Early Termination Fee',
            type: 'late_fee',
          }, connection);
        }

        await leaseModel.update(leaseId, { status: 'ended', endDate: terminationDate }, connection);
        await invoiceModel.voidFuturePendingByLeaseId(leaseId, terminationDate, connection);
        await unitModel.update(lease.unitId, { status: 'maintenance' }, connection);
      }

      const auditLogger = (await import('../utils/auditLogger.js')).default;
      await auditLogger.log({
        userId: user?.id || null,
        actionType: 'LEASE_TERMINATION',
        entityId: leaseId,
        details: { terminationDate, status: lease.status },
      }, null, connection);

      const notificationModel = (await import('../models/notificationModel.js')).default;
      await notificationModel.create({
        userId: lease.tenantId,
        message: `Your lease for Unit has been terminated effective ${terminationDate}.`,
        type: 'lease',
        severity: 'warning',
      }, connection);

      const userModel = (await import('../models/userModel.js')).default;
      const treasurers = await userModel.findByRole('treasurer');
      for (const t of treasurers) {
        await notificationModel.create({
          userId: t.user_id,
          message: `Lease #${leaseId} terminated. Process Security Deposit Refund.`,
          type: 'lease',
          severity: 'warning',
        }, connection);
      }

      await connection.commit();
      return { status: todayDate < start ? 'cancelled' : 'ended', terminationDate };
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

    if (lease.status !== 'expired') {
      throw new Error('Only expired leases can be finalized for checkout');
    }

    // Check if security deposit is settled (refunded or offset)
    if (!['refunded', 'partially_refunded', 'offset'].includes(lease.depositStatus)) {
        // We allow finalizing even if not fully refunded, but we should log/warn
        // For this state machine, ending the lease is the final step.
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const today = getLocalTime();
      const actualCheckoutAt = today.toISOString().slice(0, 19).replace('T', ' ');

      // 1. Update lease status to 'ended' and set actual_checkout_at
      await leaseModel.update(leaseId, {
        status: 'ended',
        actualCheckoutAt: actualCheckoutAt
      }, connection);

      // 2. Update unit status back to 'available' (from 'maintenance')
      await unitModel.update(lease.unitId, { status: 'available' }, connection);

      // 3. Audit Log
      const auditLogger = (await import('../utils/auditLogger.js')).default;
      await auditLogger.log({
        userId: user.id,
        actionType: 'LEASE_CHECKOUT_FINALIZED',
        entityId: leaseId,
        details: { actualCheckoutAt, unitId: lease.unitId },
      }, null, connection);

      await connection.commit();
      return { status: 'ended', actualCheckoutAt };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getLeases(user) {
    if (user.role === 'owner') return await leaseModel.findAll(user.id);
    if (user.role === 'treasurer') {
      return await leaseModel.findAll(null, user.id);
    }
    if (user.role === 'tenant') return await leaseModel.findByTenantId(user.id);
    throw new Error('Access denied');
  }

  async getLeaseById(id, user) {
    const lease = await leaseModel.findById(id);
    if (!lease) throw new Error('Lease not found');
    if (user.role === 'owner') {
      const propertyModel = (await import('../models/propertyModel.js')).default;
      const property = await propertyModel.findById(lease.propertyId);
      if (property && String(property.ownerId) === String(user.id)) return lease;
    }
    if (user.role === 'treasurer') {
      const staffModel = (await import('../models/staffModel.js')).default;
      const assigned = await staffModel.getAssignedProperties(user.id);
      if (assigned.some(p => String(p.property_id) === String(lease.propertyId))) return lease;
    }
    if (user.role === 'tenant' && String(lease.tenantId) === String(user.id)) return lease;
    throw new Error('Access denied');
  }

  async updateNoticeStatus(leaseId, status, user) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');
    if (user.role === 'tenant' && String(lease.tenantId) !== String(user.id)) throw new Error('Access denied');
    if (!['undecided', 'vacating', 'renewing'].includes(status)) throw new Error('Invalid notice status');
    await leaseModel.update(leaseId, { noticeStatus: status });

    // [FIX] Negotiated Renewal Flow: Create a renewal request instead of a draft lease
    if (status === 'renewing' && lease.status === 'active' && lease.endDate) {
        await renewalService.createFromNotice(leaseId, user);
        console.log(`[RENEWAL] Created renewal request for Lease ${leaseId}`);
    }

    return true;
  }

  async updateLeaseDocument(id, documentUrl, user = null) {
    const lease = await leaseModel.findById(id);
    if (!lease) throw new Error('Lease not found');
    
    await leaseModel.update(id, { documentUrl: documentUrl });
    
    const auditLogger = (await import('../utils/auditLogger.js')).default;
    await auditLogger.log({
      userId: user?.id || null,
      actionType: 'LEASE_DOCUMENT_UPDATED',
      entityId: id,
      details: { documentUrl }
    });
    
    return true;
  }

  async addRentAdjustment(leaseId, data, user) {
    const lease = await this.getLeaseById(leaseId, user);
    if (!lease) throw new Error('Lease not found');
    if (user.role !== 'owner') throw new Error('Access denied: Only owners can perform rent adjustments');

    const { effectiveDate, newMonthlyRent, notes } = data;
    const start = parseLocalDate(lease.startDate);
    const eff = parseLocalDate(effectiveDate);

    if (eff < start) throw new Error('Adjustment date cannot be before lease start');
    if (lease.endDate && eff > parseLocalDate(lease.endDate)) throw new Error('Adjustment date cannot be after lease end');

    const adjustmentId = await leaseModel.createAdjustment({
      leaseId,
      effectiveDate,
      newMonthlyRent,
      notes
    });

    const auditLogger = (await import('../utils/auditLogger.js')).default;
    await auditLogger.log({
      userId: user.id,
      actionType: 'LEASE_RENT_ADJUSTED',
      entityId: leaseId,
      details: { adjustmentId, newMonthlyRent, effectiveDate }
    });

    return adjustmentId;
  }


  async getRentAdjustments(leaseId, user) {
    const lease = await this.getLeaseById(leaseId, user);
    if (!lease) throw new Error('Lease not found');
    return await leaseModel.findAdjustmentsByLeaseId(leaseId);
  }

  async cancelLease(leaseId, user) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const lease = await leaseModel.findById(leaseId, conn);
      if (!lease) throw new Error('Lease not found');
      if (['active', 'expired', 'ended'].includes(lease.status)) {
          throw new Error('Only draft or pending leases can be cancelled manually. Use termination flow for active leases.');
      }

      await leaseModel.update(leaseId, { status: 'cancelled' }, conn);

      // [HARD RESERVATION FIX] Check if unit should go back to available
      const [otherClaims] = await conn.query(
        "SELECT lease_id FROM leases WHERE unit_id = ? AND status IN ('active', 'draft', 'pending') AND lease_id != ?",
        [lease.unitId, leaseId]
      );
      if (otherClaims.length === 0) {
        await conn.query(
          "UPDATE units SET status = 'available' WHERE unit_id = ? AND status = 'reserved'", 
          [lease.unitId]
        );
      }

      const auditLogger = (await import('../utils/auditLogger.js')).default;
      await auditLogger.log({
        userId: user.id,
        actionType: 'LEASE_CANCELLED_BY_STAFF',
        entityId: leaseId,
        details: { unitId: lease.unitId }
      }, null, conn);

      await conn.commit();
      return true;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async regenerateMagicLink(leaseId, user) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      
      const lease = await leaseModel.findById(leaseId, conn);
      if (!lease) throw new Error('Lease not found');
      if (lease.status !== 'draft') throw new Error('Magic links can only be regenerated for draft leases.');

      // Find the deposit invoice
      const [invoices] = await conn.query(
        "SELECT * FROM rent_invoices WHERE lease_id = ? AND invoice_type = 'deposit' AND status = 'pending'",
        [leaseId]
      );
      
      if (invoices.length === 0) throw new Error('No pending deposit invoice found for this lease.');
      
      const invoice = invoices[0];
      const rawToken = randomUUID();
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = formatToLocalDate(addDays(today(), 2));

      await conn.query(
        "UPDATE rent_invoices SET magic_token_hash = ?, magic_token_expires_at = ? WHERE invoice_id = ?",
        [tokenHash, expiresAt, invoice.invoice_id]
      );

      // Notify via email - Reusing emailService
      const emailService = (await import('../utils/emailService.js')).default;
      const userModel = (await import('../models/userModel.js')).default;
      const propertyModel = (await import('../models/propertyModel.js')).default;

      const tenant = await userModel.findById(lease.tenantId);
      const unit = await unitModel.findById(lease.unitId, conn);
      const property = await propertyModel.findById(unit.propertyId, conn);

      if (tenant && tenant.email) {
          await emailService.sendDepositMagicLink(
              tenant.email, 
              tenant.name, 
              property.name, 
              unit.unitNumber, 
              invoice.amount, 
              rawToken
          );
      }

      const auditLogger = (await import('../utils/auditLogger.js')).default;
      await auditLogger.log({
          userId: user.id || null,
          actionType: 'MAGIC_LINK_REGENERATED',
          entityId: leaseId,
          details: { invoiceId: invoice.invoice_id }
      }, null, conn);

      await conn.commit();
      return true;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}

export default new LeaseService();
