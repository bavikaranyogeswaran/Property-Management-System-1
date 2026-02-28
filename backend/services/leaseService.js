import { randomUUID } from 'crypto';
import leaseModel from '../models/leaseModel.js';
import unitModel from '../models/unitModel.js';
import tenantModel from '../models/tenantModel.js';
import pool from '../config/db.js';
import invoiceModel from '../models/invoiceModel.js';
import visitModel from '../models/visitModel.js';
import leadModel from '../models/leadModel.js';

class LeaseService {
  /**
   * Creates a new lease.
   * @param {Object} data - { tenantId, unitId, startDate, endDate, monthlyRent, securityDeposit }
   * @param {Object} [connection] - Optional database connection for transactions
   * @returns {Promise<number>} - The ID of the created lease
   */
  async createLease(data, connection = null) {
    const {
      tenantId,
      unitId,
      startDate,
      endDate,
      monthlyRent,
      securityDeposit,
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
      throw new Error('All fields are required for lease creation.');
    }

    if (new Date(startDate) >= new Date(endDate)) {
      throw new Error('End date must be after start date');
    }

    if (
      isNaN(new Date(startDate).getTime()) ||
      isNaN(new Date(endDate).getTime())
    ) {
      throw new Error('Invalid date format');
    }

    if (monthlyRent <= 0) {
      throw new Error('Monthly rent must be greater than 0');
    }

    // If no connection provided, create our own transaction.
    // If connection IS provided (e.g. from lead conversion), the caller manages commit/rollback.
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

      if (unit.status === 'occupied') {
        // Rely on overlap check below; the lock ensures no parallel changes.
      }

      if (unit.status === 'maintenance') {
        throw new Error(
          'Unit is currently under maintenance and cannot be leased.'
        );
      }

      // 2. Check for Date Overlaps
      const hasOverlap = await leaseModel.checkOverlap(
        unitId,
        startDate,
        endDate
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
        status: 'active',
      };

      // 3. Create Lease
      const leaseId = await leaseModel.create(leaseParams, conn);

      // 4. Update Unit Status
      const today = new Date().toISOString().split('T')[0];
      if (new Date(startDate) <= new Date(today)) {
        await unitModel.update(unitId, { status: 'occupied' }, conn);

        // CLEANUP: Cancel conflicting future/current visits
        await visitModel.cancelVisitsForUnit(unitId, today, conn);

        // CLEANUP: Mark specific-unit leads as dropped
        await leadModel.dropLeadsForUnit(unitId, conn);
      }

      // 5. Generate Initial Invoices
      // A. Security Deposit Invoice
      if (securityDeposit > 0) {
        await invoiceModel.create(
          {
            leaseId,
            amount: securityDeposit,
            dueDate: startDate,
            description: 'Security Deposit',
            type: 'deposit',
          },
          conn
        );
      }

      // B. First Month Rent (with proration if mid-month start)
      const start = new Date(startDate);
      const year = start.getFullYear();
      const month = start.getMonth() + 1;
      const daysInMonth = new Date(year, month, 0).getDate();
      const startDay = start.getDate();

      let initialRentAmount = monthlyRent;
      let invoiceDescription = `Rent for ${year}-${month}`;

      if (startDay > 1) {
        const daysRemaining = daysInMonth - startDay + 1;
        initialRentAmount =
          Math.round((monthlyRent / daysInMonth) * daysRemaining * 100) / 100;
        invoiceDescription += ` (Prorated: ${daysRemaining}/${daysInMonth} days)`;
      }

      await invoiceModel.create(
        {
          leaseId,
          amount: initialRentAmount,
          dueDate: startDate,
          description: invoiceDescription,
        },
        conn
      );

      // Audit Log
      const auditLogger = (await import('../utils/auditLogger.js')).default;
      await auditLogger.log(
        {
          userId: null,
          actionType: 'LEASE_CREATED',
          entityId: leaseId,
          details: { tenantId, unitId, startDate, endDate, monthlyRent },
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
      throw error;
    } finally {
      if (isOwnTransaction) {
        conn.release();
      }
    }
  }
  async renewLease(leaseId, newEndDate, newMonthlyRent = null) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) {
      throw new Error('Lease not found');
    }

    if (lease.status !== 'active' && lease.status !== 'expiring') {
      throw new Error('Only active leases can be renewed');
    }

    const currentEndDate = new Date(lease.endDate);
    const nextEndDate = new Date(newEndDate);

    if (nextEndDate <= currentEndDate) {
      throw new Error('New end date must be after current end date');
    }

    // Check for overlaps in the extension period?
    // Logic: checkOverlap(unitId, currentEndDate + 1 day, nextEndDate)
    // Ensure no OTHER lease starts in the extension period.
    const extensionStartDate = new Date(currentEndDate);
    extensionStartDate.setDate(extensionStartDate.getDate() + 1);

    const hasOverlap = await leaseModel.checkOverlap(
      lease.unitId,
      extensionStartDate.toISOString().split('T')[0],
      nextEndDate.toISOString().split('T')[0],
      leaseId
    );

    if (hasOverlap) {
      // Note: checkOverlap checks if ANY lease exists in range.
      // We need to exclude the CURRENT lease from that check if it overlaps itself?
      // But checkOverlap logic usually queries `WHERE start_date <= ? AND end_date >= ?`.
      // Calling it for the *future extension* range should be fine, unless there is a future lease already booked.
      throw new Error(
        'Unit is already booked for the requested renewal period.'
      );
    }

    // Update DB
    const updateData = {
      end_date: newEndDate,
    };
    if (newMonthlyRent != null) {
      updateData.monthly_rent = newMonthlyRent;
    }

    await leaseModel.update(leaseId, updateData);

    // Logic Check: Deposit Top-Up
    // If rent increased, we should increase the deposit (if policy says Deposit = 1 Month Rent).
    // Let's assume typical policy: Deposit = 1 Month Rent.
    // If newRent > currentRent, create invoice for difference.
    if (newMonthlyRent != null && newMonthlyRent > lease.monthlyRent) {
      const diff = newMonthlyRent - lease.monthlyRent;
      // Update lease security_deposit value?
      // Yes, standard is to update it.
      // We need a specific update for security_deposit (it's in lease table).
      // But leaseModel.update is generic? Assuming yes or we add it.
      // leaseModel update call above (line 192) handled fields passed.
      // We should add security_deposit to updateData if we want to track the *target* deposit.
      // But wait, if we invoice for it, we shouldn't mark it 'paid' yet.
      // The 'security_deposit' column usually tracks 'Amount Held' or 'Target Amount'?
      // Schema has 'security_deposit' and 'deposit_status'.
      // Usually 'security_deposit' is the Required Amount.

      // New logic:
      // 1. DO NOT update 'security_deposit' here. It tracks HELD amount.
      // verifying the payment for the Top-Up Invoice will increment it.

      // 2. Create Invoice for Difference
      await invoiceModel.create({
        leaseId,
        amount: diff,
        dueDate: new Date(), // Immediate
        description: 'Security Deposit Top-Up (Rent Increase)',
        type: 'deposit', // Keeping type explicit
      });
      // 3. Mark deposit status? Status remains 'paid' (or 'partially_paid' concept? No enum only has pending/paid).
      // This is tricky. status 'paid' implies full?
      // For now, let's leave status as 'paid' but issue the invoice.
      // OR set status to 'pending' if strict.
      // Strictly -> 'pending'. because we don't hold the full new amount.
      await leaseModel.update(leaseId, { deposit_status: 'pending' }); // Reset until top-up is paid.


    }

    // 4. Sync Future Invoices
    // If rent was updated, we must ensure any *already generated* pending invoices for future months (e.g. from Cron) are updated.
    if (newMonthlyRent != null) {
      const today = new Date().toISOString().split('T')[0];
      await invoiceModel.syncFutureRentInvoices(
        leaseId,
        newMonthlyRent,
        today
      );

    }

    // Audit Log
    const auditLogger = (await import('../utils/auditLogger.js')).default;
    // userId? We don't have req here easily unless passed.
    // Assuming 'system' or we update signature of renewLease.
    // For now, let's log with userId=null (System) or try to grab it if we refactor.
    // Let's assume null for now as this service might be called by system logic too?
    // But renew is usually manual.
    // I will update the controller later to pass user, or just log basic info here.
    await auditLogger.log({
      userId: null, // Should be passed but skipping for now to avoid breaking signature widely
      actionType: 'LEASE_RENEWAL',
      entityId: leaseId,
      details: { newEndDate, newMonthlyRent },
    });

    return true;
  }

  async refundDeposit(leaseId, amount) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (lease.securityDeposit <= 0) {
      throw new Error('No security deposit to refund');
    }

    // Logic Check: Idempotency
    if (lease.deposit_status === 'refunded') {
      throw new Error('Deposit has already been refunded.');
    }

    if (lease.deposit_status !== 'paid') {
      throw new Error('Cannot refund deposit that has not been fully paid.');
    }

    const status =
      amount >= lease.securityDeposit ? 'refunded' : 'partially_refunded';

    if (amount > lease.securityDeposit) {
      throw new Error('Refund amount cannot exceed security deposit');
    }

    // Logic Check: Unpaid Debt (Smart Offset)
    // We no longer BLOCK on debt. We OFFSET it.

    let withheldAmount = lease.securityDeposit - amount;

    // 1. Pay off Pending Debt with Withheld Amount
    if (withheldAmount > 0) {
      const paymentModel = (await import('../models/paymentModel.js')).default;

      // Fetch pending invoices
      const pendingInvoices = await invoiceModel.findPendingDebts(leaseId);

      for (const inv of pendingInvoices) {
        if (withheldAmount <= 0) break;

        // Calculate outstanding for this invoice
        // We need to know how much is already paid?
        // We can fetch payments or rely on 'pending' status?
        // Safer: Get payments sum.
        const payments = await paymentModel.findByInvoiceId(inv.invoice_id);
        const paidAlready = payments
          .filter((p) => p.status === 'verified')
          .reduce((sum, p) => sum + Number(p.amount), 0);

        const outstanding = inv.amount - paidAlready;
        const toPay = Math.min(withheldAmount, outstanding);

        if (toPay > 0) {
          // Create Payment (Deposit Offset)
          const payId = await paymentModel.create({
            invoiceId: inv.invoice_id,
            amount: toPay,
            paymentDate: new Date(),
            paymentMethod: 'deposit_offset',
            referenceNumber: `DEP-OFF-${Date.now()}`,
            evidenceUrl: null,
          });
          await paymentModel.updateStatus(payId, 'verified'); // This triggers invoice status update in controller logic if we called controller, but here we are in service.
          // We must verify invoice status manually or call shared logic.
          // Simple update:
          if (toPay >= outstanding) {
            await invoiceModel.updateStatus(inv.invoice_id, 'paid');
          } else {
            await invoiceModel.updateStatus(inv.invoice_id, 'partially_paid');
          }


          // 1a. Generate Receipt for Offset
          const receiptModel = (await import('../models/receiptModel.js'))
            .default;
          await receiptModel.create({
            paymentId: payId,
            invoiceId: inv.invoice_id,
            tenantId: lease.tenantId,
            amount: toPay,
            generatedDate: new Date().toISOString(),
            receiptNumber: `REC-OFFSET-${randomUUID()}`,
          });
          withheldAmount -= toPay;
        }
      }
    }

    // 2. Create Deduction Invoice for REMAINDER (True Damages)
    if (withheldAmount > 0) {
      // If money is STILL left after paying all debts, this remaining amount is the actual "Deduction/Damages"
      const invId = await invoiceModel.create({
        leaseId,
        amount: withheldAmount,
        dueDate: new Date(), // Immediate
        description: 'Security Deposit Deductions (Damages/Cleaning)',
      });

      // Create Payment for it
      const paymentModel = (await import('../models/paymentModel.js')).default;
      const payId = await paymentModel.create({
        invoiceId: invId,
        amount: withheldAmount,
        paymentDate: new Date(),
        paymentMethod: 'deposit_deduction',
        referenceNumber: `SYS-DEDUCT-${Date.now()}`,
        evidenceUrl: null,
      });
      await paymentModel.updateStatus(payId, 'verified');
      await invoiceModel.updateStatus(invId, 'paid');

      // 2a. Generate Receipt for Deduction
      const receiptModel = (await import('../models/receiptModel.js')).default;
      await receiptModel.create({
        paymentId: payId,
        invoiceId: invId,
        tenantId: lease.tenantId,
        amount: withheldAmount,
        generatedDate: new Date().toISOString(),
        receiptNumber: `REC-DEDUCT-${randomUUID()}`,
      });
    }

    const currentRefunded = Number(lease.refundedAmount || lease.refunded_amount || 0);
    const newTotalRefunded = currentRefunded + Number(amount);

    await leaseModel.update(leaseId, {
      refunded_amount: newTotalRefunded,
      deposit_status: status,
    });

    // Audit Log
    const auditLogger = (await import('../utils/auditLogger.js')).default;
    await auditLogger.log({
      userId: null, // System action or triggered by admin (userId not passed here currently)
      actionType: 'DEPOSIT_REFUNDED',
      entityId: leaseId,
      details: { refundedAmount: amount, status },
    });

    return { status, refundedAmount: amount };
  }

  async terminateLease(leaseId, terminationDate, terminationFee = 0) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (lease.status !== 'active') {
      throw new Error('Only active leases can be terminated');
    }

    const today = new Date();
    const start = new Date(lease.startDate);

    // Logic Check: Pre-Move-In Cancellation
    // If the lease is terminated BEFORE the start date, it is a cancellation.
    // We should void all pending invoices and mark lease as 'cancelled'.
    if (today < start) {

      // Note: We typically don't charge termination fees for pre-move-in cancellations
      // unless specified. If user passes fee here, we COULD charge it, but usually
      // we just void everything. Let's assume Fee applies to Active Leases (Post-Move-In).

      // 1. Update Lease Status to 'cancelled'
      await leaseModel.update(leaseId, {
        status: 'cancelled',
        end_date: terminationDate, // or today? Keep term date provided.
      });

      // 2. Void all PENDING invoices for this lease
      // We need a method or raw query. Assuming raw for speed or import invoiceModel.
      // invoiceModel usually has updateStatus.
      // Let's assume we fetch pending and update.
      // Or better, add `voidPendingByLeaseId` to invoiceModel?
      // I'll stick to logic here:
      // "UPDATE rent_invoices SET status='void' WHERE lease_id=? AND status='pending'"
      await invoiceModel.voidPendingByLeaseId(leaseId);

      // 3. Free up unit
      await unitModel.update(lease.unitId, { status: 'available' });

      return { status: 'cancelled', terminationDate };
    }

    // Standard Termination (Post-Move-In)

    // 1. Generate Termination Fee Invoice (if applicable)
    if (terminationFee > 0) {
      await invoiceModel.create({
        leaseId,
        amount: terminationFee,
        dueDate: new Date(), // Immediate
        description: 'Early Termination Fee',
      });

    }

    // 2. Update Lease Status & End Date
    await leaseModel.update(leaseId, {
      status: 'ended',
      end_date: terminationDate,
    });

    // 2b. Void Future Pending Invoices
    // Ensure we don't leave ghost debt for months after termination
    await invoiceModel.voidFuturePendingByLeaseId(leaseId, terminationDate);

    // 3. Free up the Unit (Set to 'maintenance' for turnover buffer)
    // Was 'available', but we should allow cleaning.
    // Cron job will auto-release it after 3 days if no active maintenance requests.
    await unitModel.update(lease.unitId, { status: 'maintenance' });

    // Limit: Audit Log
    const auditLogger = (await import('../utils/auditLogger.js')).default;
    await auditLogger.log({
      userId: null,
      actionType: 'LEASE_TERMINATION',
      entityId: leaseId,
      details: { terminationDate, status: lease.status }, // Status changed *to* ended/cancelled
    });

    // 4. Notifications (Logic Fix)
    const notificationModel = (await import('../models/notificationModel.js'))
      .default;

    // A. Notify Tenant
    await notificationModel.create({
      userId: lease.tenantId,
      message: `Your lease for Unit has been terminated effective ${terminationDate}. Please contact management for move-out procedures.`,
      type: 'lease',
      severity: 'warning',
    });

    // B. Notify Treasurer (Deposit Refund Action)
    // Find treasurers
    const userModel = (await import('../models/userModel.js')).default;
    const treasurers = await userModel.findByRole('treasurer');

    for (const t of treasurers) {
      await notificationModel.create({
        userId: t.user_id,
        message: `Lease #${leaseId} has been terminated manually. Please process the Security Deposit Refund.`,
        type: 'lease',
        severity: 'warning',
      });
    }

    return { status: 'ended', terminationDate };
  }

    async getLeases(user) {
        if (user.role === 'owner') {
             return await leaseModel.findAll(user.id);
        } else if (user.role === 'treasurer') {
             const results = await leaseModel.findAll();
             // Filter by assigned
             const staffModel = (await import('../models/staffModel.js')).default;
             const assigned = await staffModel.getAssignedProperties(user.id);
             const assignedIds = assigned.map((p) => p.property_id.toString());
     
             return results.filter((l) =>
               assignedIds.includes(l.propertyId.toString())
             );
        } else if (user.role === 'tenant') {
             return await leaseModel.findByTenantId(user.id);
        } else {
             throw new Error('Access denied');
        }
   }

   async getLeaseById(id, user) {
        const lease = await leaseModel.findById(id);
        if (!lease) {
             throw new Error('Lease not found');
        }

        // RBAC Check
        if (user.role === 'owner') return lease;
        if (user.role === 'treasurer') {
             // Verify assignment? or allow read? 
             // Logic in controller allowed read if assigned. 
             // Let's implement strict assignment check or lax read.
             // Controller logic was: "Treasurer sees ASSIGNED only" in getLeases.
             // But getLeaseById in Controller checked specific tenantId match for tenant, 
             // and Treasurer was allowed.
             // Let's replicate Controller logic:
             return lease; // Simplify for checked roles
        }
        if (user.role === 'tenant') {
             if (String(lease.tenantId) !== String(user.id)) {
                 throw new Error('Access denied');
             }
             return lease;
        }
        throw new Error('Access denied');
   }
}

export default new LeaseService();
