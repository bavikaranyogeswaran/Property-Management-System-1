import { randomUUID } from 'crypto';
import leaseModel from '../models/leaseModel.js';
import unitModel from '../models/unitModel.js';
import tenantModel from '../models/tenantModel.js';
import pool from '../config/db.js';
import invoiceModel from '../models/invoiceModel.js';
import visitModel from '../models/visitModel.js';
import leadModel from '../models/leadModel.js';
import { validateLeaseDuration } from '../utils/validators.js';

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
      documentUrl, // [ADDED] Document URL
    } = data;

    // Validation (runs before acquiring any connection)
    if (
      !tenantId ||
      !unitId ||
      !startDate ||
      (monthlyRent === undefined || monthlyRent === null)
    ) {
      throw new Error('All fields are required for lease creation.');
    }

    if (endDate && new Date(startDate) >= new Date(endDate)) {
      throw new Error('End date must be after start date');
    }

    if (endDate) {
        const durationCheck = validateLeaseDuration(startDate, endDate);
        if (!durationCheck.isValid) {
            throw new Error(durationCheck.error);
        }
    }

    if (
      isNaN(new Date(startDate).getTime()) ||
      (endDate && isNaN(new Date(endDate).getTime()))
    ) {
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
        status: 'active',
        documentUrl: documentUrl || null,
        lease_term_id: data.leaseTermId || null,
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
      if (securityDeposit > 0) {
        await invoiceModel.create(
          {
            leaseId,
            amount: securityDeposit,
            dueDate: new Date(new Date(startDate).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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
          dueDate: new Date(new Date(startDate).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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
    if (!lease) throw new Error('Lease not found');

    if (lease.status !== 'active') {
      throw new Error('Only active leases can be renewed');
    }

    const currentEndDate = new Date(lease.endDate);
    const nextEndDate = new Date(newEndDate);

    if (nextEndDate <= currentEndDate) {
      throw new Error('New end date must be after current end date');
    }

    const extensionStartDate = new Date(currentEndDate);
    extensionStartDate.setDate(extensionStartDate.getDate() + 1);

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const hasOverlap = await leaseModel.checkOverlap(
        lease.unitId,
        extensionStartDate.toISOString().split('T')[0],
        nextEndDate.toISOString().split('T')[0],
        leaseId,
        connection
      );

      if (hasOverlap) {
        throw new Error('Unit is already booked for the requested renewal period.');
      }

      const updateData = { end_date: newEndDate };
      if (newMonthlyRent != null) {
        updateData.monthly_rent = newMonthlyRent;
      }

      await leaseModel.update(leaseId, updateData, connection);

      if (newMonthlyRent != null && newMonthlyRent > lease.monthlyRent) {
        const diff = newMonthlyRent - lease.monthlyRent;
        await invoiceModel.create({
          leaseId,
          amount: diff,
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          description: 'Security Deposit Top-Up (Rent Increase)',
          type: 'deposit',
        }, connection);

        await leaseModel.update(leaseId, { deposit_status: 'pending' }, connection);
      }

      if (newMonthlyRent != null) {
        const today = new Date().toISOString().split('T')[0];
        await invoiceModel.syncFutureRentInvoices(
          leaseId,
          newMonthlyRent,
          today,
          connection
        );
      }

      const auditLogger = (await import('../utils/auditLogger.js')).default;
      await auditLogger.log({
        userId: null,
        actionType: 'LEASE_RENEWAL',
        entityId: leaseId,
        details: { newEndDate, newMonthlyRent },
      }, null, connection);

      await connection.commit();
      return true;

    } catch (error) {
      await connection.rollback();
      console.error('Renew Lease Transaction Failed:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async refundDeposit(leaseId, amount) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (lease.securityDeposit <= 0) {
      throw new Error('No security deposit available to refund.');
    }

    if (lease.deposit_status === 'refunded') {
      throw new Error('Deposit has already been refunded.');
    }

    if (lease.deposit_status !== 'paid') {
      throw new Error('Cannot refund deposit that has not been fully paid.');
    }

    const status = amount >= lease.securityDeposit ? 'refunded' : 'partially_refunded';

    if (amount > lease.securityDeposit) {
      throw new Error('Refund amount cannot exceed security deposit');
    }

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
              paymentDate: new Date(),
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
              generatedDate: new Date().toISOString(),
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
              entryDate: new Date().toISOString().split('T')[0],
            }, connection);

            await ledgerModel.create({
              paymentId: payId,
              invoiceId: inv.invoice_id,
              leaseId: Number(leaseId),
              accountType: 'liability',
              category: 'deposit_withheld',
              debit: Number(toPay),
              description: `Security deposit withheld for outstanding debt`,
              entryDate: new Date().toISOString().split('T')[0],
            }, connection);

            withheldAmount -= toPay;
          }
        }
      }

      if (withheldAmount > 0) {
        const invId = await invoiceModel.create({
          leaseId,
          amount: withheldAmount,
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          description: 'Security Deposit Deductions (Damages/Cleaning)',
          type: 'maintenance',
        }, connection);

        const paymentModel = (await import('../models/paymentModel.js')).default;
        const payId = await paymentModel.create({
          invoiceId: invId,
          amount: withheldAmount,
          paymentDate: new Date(),
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
          generatedDate: new Date().toISOString(),
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
          entryDate: new Date().toISOString().split('T')[0],
        }, connection);

        await ledgerModel.create({
          paymentId: payId,
          invoiceId: invId,
          leaseId: Number(leaseId),
          accountType: 'liability',
          category: 'deposit_withheld',
          debit: Number(withheldAmount),
          description: `Security deposit withheld for property damages`,
          entryDate: new Date().toISOString().split('T')[0],
        }, connection);
      }

      await leaseModel.update(leaseId, {
        refunded_amount: Number(lease.refundedAmount || 0) + Number(amount),
        deposit_status: status,
      }, connection);

      const auditLogger = (await import('../utils/auditLogger.js')).default;
      await auditLogger.log({
        userId: null,
        actionType: 'DEPOSIT_REFUNDED',
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
          description: `Deposit refund of ${amount}`,
          entryDate: new Date().toISOString().split('T')[0],
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

  async terminateLease(leaseId, terminationDate, terminationFee = 0) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (lease.status !== 'active') {
      throw new Error('Only active leases can be terminated');
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const today = new Date();
      const start = new Date(lease.startDate);

      if (today < start) {
        await leaseModel.update(leaseId, { status: 'cancelled', end_date: terminationDate }, connection);
        await invoiceModel.voidPendingByLeaseId(leaseId, connection);
        await unitModel.update(lease.unitId, { status: 'available' }, connection);
      } else {
        if (terminationFee > 0) {
          await invoiceModel.create({
            leaseId,
            amount: terminationFee,
            dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            description: 'Early Termination Fee',
            type: 'late_fee',
          }, connection);
        }

        await leaseModel.update(leaseId, { status: 'ended', end_date: terminationDate }, connection);
        await invoiceModel.voidFuturePendingByLeaseId(leaseId, terminationDate, connection);
        await unitModel.update(lease.unitId, { status: 'maintenance' }, connection);
      }

      const auditLogger = (await import('../utils/auditLogger.js')).default;
      await auditLogger.log({
        userId: null,
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
      return { status: today < start ? 'cancelled' : 'ended', terminationDate };
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
      const results = await leaseModel.findAll();
      const staffModel = (await import('../models/staffModel.js')).default;
      const assigned = await staffModel.getAssignedProperties(user.id);
      const assignedIds = assigned.map((p) => String(p.property_id));
      return results.filter((l) => assignedIds.includes(String(l.propertyId)));
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
      if (property && String(property.owner_id) === String(user.id)) return lease;
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
    await leaseModel.update(leaseId, { notice_status: status });
    return true;
  }
}

export default new LeaseService();
