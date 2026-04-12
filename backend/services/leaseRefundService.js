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
import paymentModel from '../models/paymentModel.js';
import receiptModel from '../models/receiptModel.js';
import ledgerModel from '../models/ledgerModel.js';
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
import notificationModel from '../models/notificationModel.js';
import userModel from '../models/userModel.js';

class LeaseRefundService {
  constructor(facade) {
    this.facade = facade;
  }

  async requestRefund(leaseId, amount, notes, user) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    const ledgerBalance = await leaseModel.getDepositBalance(leaseId);
    if (ledgerBalance <= 0) {
      throw new Error('No security deposit available to refund.');
    }

    if (['refunded', 'awaiting_approval'].includes(lease.depositStatus)) {
      throw new Error(
        `Deposit is already ${lease.depositStatus.replace('_', ' ')}.`
      );
    }

    if (
      lease.depositStatus !== 'paid' &&
      lease.depositStatus !== 'partially_refunded'
    ) {
      throw new Error('Cannot refund deposit that has not been fully paid.');
    }

    // [B2 FIX] Removed duplicate getDepositBalance call that reassigned a const
    if (amount > ledgerBalance) {
      throw new Error(
        `Refund amount (LKR ${amount.toLocaleString()}) cannot exceed verified ledger balance (LKR ${ledgerBalance.toLocaleString()}).`
      );
    }

    await leaseModel.update(leaseId, {
      depositStatus: 'awaiting_approval',
      proposedRefundAmount: amount,
      refundNotes: notes,
    });

    await auditLogger.log({
      userId: user.id || user.user_id,
      actionType: 'DEPOSIT_REFUND_REQUESTED',
      entityId: leaseId,
      entityType: 'lease',
      details: { amount, notes },
    });

    return { status: 'awaiting_approval', proposedRefundAmount: amount };
  }

  async approveRefund(leaseId, user) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (
      !lease.proposedRefundAmount ||
      Number(lease.proposedRefundAmount) <= 0
    ) {
      throw new Error('No refund request awaiting approval.');
    }

    const amount = lease.proposedRefundAmount;
    // Status moves to 'awaiting_acknowledgment' instead of directly to 'refunded'
    const status = 'awaiting_acknowledgment';

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const ledgerBalance = await leaseModel.getDepositBalance(
        leaseId,
        connection
      );
      if (amount > ledgerBalance) {
        throw new Error(
          `Refund amount (LKR ${amount.toLocaleString()}) cannot exceed verified ledger balance (LKR ${ledgerBalance.toLocaleString()}).`
        );
      }

      let withheldAmount = ledgerBalance - amount;

      if (withheldAmount > 0) {
        const pendingInvoices = await invoiceModel.findPendingDebts(
          leaseId,
          connection
        );

        const invoiceIds = pendingInvoices.map((inv) => inv.invoice_id);
        const allPayments = await paymentModel.findByInvoiceIds(
          invoiceIds,
          connection
        );

        const paymentsMap = new Map();
        allPayments.forEach((p) => {
          if (!paymentsMap.has(p.invoice_id)) paymentsMap.set(p.invoice_id, []);
          paymentsMap.get(p.invoice_id).push(p);
        });

        for (const inv of pendingInvoices) {
          if (withheldAmount <= 0) break;

          const payments = paymentsMap.get(inv.invoice_id) || [];
          const paidAlready = payments
            .filter((p) => p.status === 'verified')
            .reduce((sum, p) => moneyMath(sum).add(p.amount).value(), 0);

          const outstanding = moneyMath(inv.amount).sub(paidAlready).value();
          const toPay = Math.min(withheldAmount, outstanding);

          if (toPay > 0) {
            const payId = await paymentModel.create(
              {
                invoiceId: inv.invoice_id,
                amount: toPay,
                paymentDate: getLocalTime(),
                paymentMethod: 'deposit_offset',
                referenceNumber: `DEP-OFF-${Date.now()}`,
              },
              connection
            );

            await paymentModel.updateStatus(
              payId,
              'verified',
              null,
              connection
            );

            if (toPay >= outstanding) {
              await invoiceModel.updateStatus(
                inv.invoice_id,
                'paid',
                connection
              );
            } else {
              await invoiceModel.updateStatus(
                inv.invoice_id,
                'partially_paid',
                connection
              );
            }

            await receiptModel.create(
              {
                paymentId: payId,
                invoiceId: inv.invoice_id,
                tenantId: lease.tenantId,
                amount: toPay,
                generatedDate: getLocalTime(),
                receiptNumber: `REC-OFFSET-${randomUUID()}`,
              },
              connection
            );

            await ledgerModel.create(
              {
                paymentId: payId,
                invoiceId: inv.invoice_id,
                leaseId: Number(leaseId),
                accountType: 'revenue',
                category: 'rent',
                credit: Number(toPay),
                description: `Deposit offset applied to outstanding invoice #${inv.invoice_id}`,
                entryDate: getCurrentDateString(),
              },
              connection
            );

            await ledgerModel.create(
              {
                paymentId: payId,
                invoiceId: inv.invoice_id,
                leaseId: Number(leaseId),
                accountType: 'liability',
                category: 'deposit_withheld',
                debit: Number(toPay),
                description: `Security deposit withheld for outstanding debt`,
                entryDate: getCurrentDateString(),
              },
              connection
            );

            withheldAmount -= toPay;
          }
        }
      }

      if (withheldAmount > 0) {
        const invId = await invoiceModel.create(
          {
            leaseId,
            amount: withheldAmount,
            dueDate: (() => {
              const d = getLocalTime();
              d.setDate(d.getDate() + 5);
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            })(),
            description: `Security Deposit Deductions (Damages/Cleaning): ${lease.refundNotes || ''}`,
            type: 'maintenance',
          },
          connection
        );

        const payId = await paymentModel.create(
          {
            invoiceId: invId,
            amount: withheldAmount,
            paymentDate: getLocalTime(),
            paymentMethod: 'deposit_deduction',
            referenceNumber: `SYS-DEDUCT-${Date.now()}`,
          },
          connection
        );

        await paymentModel.updateStatus(payId, 'verified', null, connection);
        await invoiceModel.updateStatus(invId, 'paid', connection);

        await receiptModel.create(
          {
            paymentId: payId,
            invoiceId: invId,
            tenantId: lease.tenantId,
            amount: withheldAmount,
            generatedDate: getLocalTime(),
            receiptNumber: `REC-DEDUCT-${randomUUID()}`,
          },
          connection
        );

        await ledgerModel.create(
          {
            paymentId: payId,
            invoiceId: invId,
            leaseId: Number(leaseId),
            accountType: 'revenue',
            category: 'maintenance',
            credit: Number(withheldAmount),
            description: `Security deposit deduction for damages: ${invId}`,
            entryDate: getCurrentDateString(),
          },
          connection
        );

        await ledgerModel.create(
          {
            paymentId: payId,
            invoiceId: invId,
            leaseId: Number(leaseId),
            accountType: 'liability',
            category: 'deposit_withheld',
            debit: Number(withheldAmount),
            description: `Security deposit withheld for property damages`,
            entryDate: today(),
          },
          connection
        );
      }

      await leaseModel.update(
        leaseId,
        {
          depositStatus: status,
        },
        connection
      );

      await auditLogger.log(
        {
          userId: user.id || user.user_id,
          actionType: 'DEPOSIT_REFUND_APPROVED',
          entityId: leaseId,
          entityType: 'lease',
          details: { status },
        },
        null,
        connection
      );

      await connection.commit();
      return { status };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async confirmDisbursement(leaseId, data, user) {
    if (user.role !== 'owner' && user.role !== 'treasurer') {
      throw new Error(
        'Access denied. Only owners and treasurers can record disbursements.'
      );
    }

    const { bankReferenceId, disbursementDate } = data;
    if (!bankReferenceId)
      throw new Error('Bank Reference ID is required for disbursement.');

    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (lease.depositStatus !== 'awaiting_acknowledgment') {
      throw new Error(
        'This refund is not in the correct state (Approved, Pending Disbursement).'
      );
    }

    const amount = lease.proposedRefundAmount;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. Finalize Lease State
      await leaseModel.update(
        leaseId,
        {
          refundedAmount: Number(lease.refundedAmount || 0) + Number(amount),
          depositStatus: 'refunded',
          proposedRefundAmount: 0,
          bankReferenceId: bankReferenceId,
          disbursementDate: disbursementDate || today(),
        },
        connection
      );

      // 2. Create the final "Cash Outflow" Ledger Entry

      await ledgerModel.create(
        {
          leaseId: Number(leaseId),
          accountType: 'liability',
          category: 'deposit_refund',
          debit: Number(amount),
          description: `Security deposit refund disbursed via bank. Ref: ${bankReferenceId}`,
          entryDate: disbursementDate || today(),
        },
        connection
      );

      await auditLogger.log(
        {
          userId: user.id || user.user_id,
          actionType: 'DEPOSIT_DISBURSED',
          entityId: leaseId,
          entityType: 'lease',
          details: { amount, bankReferenceId },
        },
        null,
        connection
      );

      await connection.commit();
      return { status: 'refunded', refundedAmount: amount, bankReferenceId };
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

    // Only the tenant of this specific lease can file a dispute
    if (user.role !== 'tenant') {
      throw new Error('Access denied: Only tenants can dispute a refund.');
    }
    if (String(lease.tenantId) !== String(user.id)) {
      throw new Error('Access denied: You are not the tenant of this lease.');
    }
    // A dispute is only valid when a settlement is awaiting the tenant's acknowledgment
    if (lease.depositStatus !== 'awaiting_acknowledgment') {
      throw new Error(
        'No refund settlement is currently awaiting your review. A dispute can only be filed after a settlement has been proposed.'
      );
    }

    await leaseModel.update(leaseId, {
      depositStatus: 'disputed',
      refundNotes: notes,
    });

    await auditLogger.log({
      userId: user.id || user.user_id,
      actionType: 'DEPOSIT_REFUND_DISPUTED',
      entityId: leaseId,
      entityType: 'lease',
      details: { notes },
    });

    // [FLOW 8 FIX] Notify Owner and Treasurers
    const property = await pool
      .query(
        'SELECT owner_id FROM properties WHERE property_id = (SELECT unit_id FROM leases WHERE lease_id = ?)',
        [leaseId]
      )
      .then(([rows]) => rows[0]);

    if (property?.owner_id) {
      await notificationModel.create({
        userId: property.owner_id,
        message: `Tenant has disputed the refund offer for Lease #${leaseId}. Notes: ${notes}`,
        type: 'lease',
        severity: 'warning',
        entityType: 'lease',
        entityId: leaseId,
      });
    }

    const treasurers = await pool
      .query("SELECT user_id FROM users WHERE role = 'treasurer'")
      .then(([rows]) => rows);
    for (const t of treasurers) {
      await notificationModel.create({
        userId: t.user_id,
        message: `Tenant has disputed the refund offer for Lease #${leaseId}. Review required.`,
        type: 'lease',
        severity: 'warning',
        entityType: 'lease',
        entityId: leaseId,
      });
    }

    return { status: 'disputed' };
  }

  async acknowledgeRefund(leaseId, tenantId) {
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    // Authorization: Only the tenant of this lease can acknowledge
    if (String(lease.tenantId) !== String(tenantId)) {
      throw new Error('Access denied: You are not the tenant of this lease.');
    }

    if (lease.depositStatus !== 'awaiting_acknowledgment') {
      throw new Error(
        'No refund settlement is currently awaiting your acknowledgment.'
      );
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const currentBalance = await leaseModel.getDepositBalance(
        leaseId,
        connection
      );
      const finalStatus =
        lease.proposedRefundAmount >= currentBalance
          ? 'refunded'
          : 'partially_refunded';

      await leaseModel.update(
        leaseId,
        {
          depositStatus: finalStatus,
        },
        connection
      );

      await auditLogger.log(
        {
          userId: tenantId,
          actionType: 'DEPOSIT_REFUND_ACKNOWLEDGED',
          entityId: leaseId,
          entityType: 'lease',
          details: { status: finalStatus, amount: lease.proposedRefundAmount },
        },
        null,
        connection
      );

      await connection.commit();
      return { status: finalStatus };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async resolveRefundDispute(leaseId, user, adjustedAmount) {
    if (user.role !== 'owner' && user.role !== 'treasurer') {
      throw new Error('Access denied');
    }

    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (lease.depositStatus !== 'disputed') {
      throw new Error('Only disputed refunds can be resolved.');
    }

    const ledgerBalance = await leaseModel.getDepositBalance(leaseId);
    if (adjustedAmount > ledgerBalance) {
      throw new Error(
        `Adjusted refund amount (LKR ${adjustedAmount.toLocaleString()}) cannot exceed verified ledger balance (LKR ${ledgerBalance.toLocaleString()}).`
      );
    }

    await leaseModel.update(leaseId, {
      depositStatus: 'awaiting_acknowledgment',
      proposedRefundAmount: adjustedAmount,
    });

    await auditLogger.log({
      userId: user.id || user.user_id,
      actionType: 'DEPOSIT_REFUND_RESOLVED',
      entityId: leaseId,
      entityType: 'lease',
      details: {
        previousStatus: 'disputed',
        newProposedAmount: adjustedAmount,
      },
    });

    // [FLOW 8 FIX] Notify Tenant of revised offer
    await notificationModel.create({
      userId: lease.tenantId,
      message: `A revised security deposit refund offer has been made for your lease. New proposed amount: LKR ${adjustedAmount.toLocaleString()}.`,
      type: 'lease',
      severity: 'info',
      entityType: 'lease',
      entityId: leaseId,
    });

    const tenant = await userModel.findById(lease.tenantId);
    if (tenant?.email) {
      try {
        const emailService = (await import('../utils/emailService.js')).default;
        await emailService.sendGenericNotification(tenant.email, {
          subject: 'Revised Refund Offer',
          message: `Your landlord has updated the security deposit refund offer for your lease. Please log in to acknowledge the new amount: LKR ${adjustedAmount.toLocaleString()}.`,
        });
      } catch (err) {
        console.error('Failed to send refund resolution email:', err);
      }
    }

    return {
      status: 'awaiting_acknowledgment',
      proposedRefundAmount: adjustedAmount,
    };
  }

  async updateDisbursementReference(leaseId, newReference, user) {
    if (user.role !== 'owner' && user.role !== 'treasurer') {
      throw new Error('Access denied');
    }

    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new Error('Lease not found');

    if (lease.depositStatus !== 'refunded') {
      throw new Error(
        'Disbursement reference can only be updated for finalized (refunded) settlements.'
      );
    }

    const oldReference = lease.bankReferenceId;
    await leaseModel.update(leaseId, { bankReferenceId: newReference });

    await auditLogger.log({
      userId: user.id || user.user_id,
      actionType: 'DEPOSIT_DISBURSEMENT_REF_UPDATED',
      entityId: leaseId,
      entityType: 'lease',
      details: { oldReference, newReference },
    });

    return { success: true, newReference };
  }

  async refundDeposit(leaseId, amount, user) {
    // This now acts as a shortcut for owners or a request for treasurers
    if (user.role === 'owner') {
      // Owners can directly approve if they want, but usually they'll use approveRefund.
      // For backward compatibility or direct action, we'll make them request then immediately approve?
      // Or just call the request then they can approve later.
      // Re-evaluating: The controller will handle the branching.
      // LeaseService.refundDeposit is now essentially requestRefund.
      return await this.facade.requestRefund(
        leaseId,
        amount,
        'Direct refund request',
        user
      );
    } else {
      return await this.facade.requestRefund(
        leaseId,
        amount,
        'Refund request by treasurer',
        user
      );
    }
  }
}

export default LeaseRefundService;
