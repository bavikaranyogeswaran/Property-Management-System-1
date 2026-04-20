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
import AppError from '../utils/AppError.js';
import { isAtLeast, ROLES } from '../utils/roleUtils.js';

class LeaseRefundService {
  constructor(facade) {
    this.facade = facade;
  }

  // REQUEST REFUND: Initiate the return of the security deposit.
  async requestRefund(leaseId, amount, notes, user) {
    // 1. Fetch lease and check available ledger balance
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new AppError('Lease not found', 404);

    const ledgerBalance = await leaseModel.getDepositBalance(leaseId);
    if (ledgerBalance <= 0)
      throw new AppError('No security deposit available to refund.', 400);

    // 2. [SECURITY] State gate: ensure no active or finished refund exists
    if (['refunded', 'awaiting_approval'].includes(lease.depositStatus)) {
      throw new AppError(
        `Deposit is already ${lease.depositStatus.replace('_', ' ')}.`,
        400
      );
    }

    if (
      lease.depositStatus !== 'paid' &&
      lease.depositStatus !== 'partially_refunded'
    ) {
      throw new AppError(
        'Cannot refund deposit that has not been fully paid.',
        400
      );
    }

    // 3. [VALIDATION] Ensure refund amount does not exceed ledger balance
    if (amount > ledgerBalance) {
      throw new AppError(
        `Refund amount cannot exceed verified ledger balance.`,
        400
      );
    }

    // 4. Update lease with proposed refund amount and status
    await leaseModel.update(leaseId, {
      depositStatus: 'awaiting_approval',
      proposedRefundAmount: amount,
      refundNotes: notes,
    });

    // 5. [AUDIT] Log the request
    await auditLogger.log({
      userId: user.id || user.user_id,
      actionType: 'DEPOSIT_REFUND_REQUESTED',
      entityId: leaseId,
      entityType: 'lease',
      details: { amount, notes },
    });

    return { status: 'awaiting_approval', proposedRefundAmount: amount };
  }

  // APPROVE REFUND: Staff finalizes the settlement and performs debt offsets.
  async approveRefund(leaseId, user) {
    // 1. Fetch lease and validate awaiting state
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new AppError('Lease not found', 404);

    if (
      !lease.proposedRefundAmount ||
      Number(lease.proposedRefundAmount) <= 0
    ) {
      throw new AppError('No refund request awaiting approval.', 400);
    }

    const amount = lease.proposedRefundAmount;
    const status = 'awaiting_acknowledgment';

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 2. [SECURITY] Atomic balance verification
      const ledgerBalance = await leaseModel.getDepositBalance(
        leaseId,
        connection
      );
      if (amount > ledgerBalance)
        throw new AppError('Refund amount violates ledger balance.', 400);

      // 3. [FINANCIAL] Calculate withheld amount for debt settlement
      let withheldAmount = ledgerBalance - amount;

      if (withheldAmount > 0) {
        // Find all unpaid invoices
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

        // 4. [FINANCIAL] Loop through debts and apply deposit offsets
        for (const inv of pendingInvoices) {
          if (withheldAmount <= 0) break;

          const payments = paymentsMap.get(inv.invoice_id) || [];
          const paidAlready = payments
            .filter((p) => p.status === 'verified')
            .reduce((sum, p) => moneyMath(sum).add(p.amount).value(), 0);
          const outstanding = moneyMath(inv.amount).sub(paidAlready).value();
          const toPay = Math.min(withheldAmount, outstanding);

          if (toPay > 0) {
            // [FINANCIAL] Perform atomic debt payment via 'deposit_offset'
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
            await invoiceModel.updateStatus(
              inv.invoice_id,
              toPay >= outstanding ? 'paid' : 'partially_paid',
              connection
            );
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

            // Record revenue and liability reduction in ledger
            await ledgerModel.create(
              {
                paymentId: payId,
                invoiceId: inv.invoice_id,
                leaseId: Number(leaseId),
                accountType: 'revenue',
                category: 'rent',
                credit: Number(toPay),
                description: `Deposit offset to inv #${inv.invoice_id}`,
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
                description: `Deposit withheld for debt`,
                entryDate: getCurrentDateString(),
              },
              connection
            );

            withheldAmount -= toPay;
          }
        }
      }

      // 5. [FINANCIAL] Any remaining withheld amount is treated as property damage deductions
      if (withheldAmount > 0) {
        const invId = await invoiceModel.create(
          {
            leaseId,
            amount: withheldAmount,
            dueDate: formatToLocalDate(addDays(getLocalTime(), 5)),
            description: `Deposit Deductions (Damages): ${lease.refundNotes || ''}`,
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
            description: `Deposit deduction for damages`,
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
            description: `Deposit withheld for property damages`,
            entryDate: today(),
          },
          connection
        );
      }

      // 6. Update lease state to 'awaiting_acknowledgment'
      await leaseModel.update(leaseId, { depositStatus: status }, connection);

      // 7. [AUDIT] Log the approval
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

  // CONFIRM DISBURSEMENT: Record the actual transfer of funds via bank.
  async confirmDisbursement(leaseId, data, user) {
    // 1. [SECURITY] RBAC check
    if (!isAtLeast(user.role, ROLES.TREASURER)) {
      throw new AppError(
        'Only Owners/Treasurers can record disbursements.',
        403
      );
    }

    const { bankReferenceId, disbursementDate } = data;
    if (!bankReferenceId)
      throw new AppError('Bank Reference ID is required.', 400);

    // 2. Fetch lease and validate disbursement state
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new AppError('Lease not found', 404);

    if (lease.depositStatus !== 'awaiting_acknowledgment') {
      throw new AppError('Settlement is not in Awaiting Disbursal state.', 400);
    }

    const amount = lease.proposedRefundAmount;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 3. Update lease with final disbursement details
      await leaseModel.update(
        leaseId,
        {
          refundedAmount: Number(lease.refundedAmount || 0) + Number(amount),
          depositStatus: 'refunded',
          proposedRefundAmount: 0,
          bankReferenceId,
          disbursementDate: disbursementDate || today(),
        },
        connection
      );

      // 4. [FINANCIAL] Record final cash outflow on the ledger
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

      // 5. [AUDIT] Log the disbursement
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

  // DISPUTE REFUND: Tenant files a disagreement with the proposed settlement.
  async disputeRefund(leaseId, notes, user) {
    // 1. [SECURITY] Role and Ownership Check
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new AppError('Lease not found', 404);

    if (
      user.role !== ROLES.TENANT ||
      String(lease.tenantId) !== String(user.id)
    ) {
      throw new AppError('Access denied: Ownership required.', 403);
    }

    // 2. [SECURITY] Process state check: can only dispute while awaiting acknowledgment
    if (lease.depositStatus !== 'awaiting_acknowledgment') {
      throw new AppError(
        'Dispute can only be filed against a proposed settlement.',
        400
      );
    }

    // 3. Update status to 'disputed'
    await leaseModel.update(leaseId, {
      depositStatus: 'disputed',
      refundNotes: notes,
    });

    // 4. [AUDIT] Log the dispute initiation
    await auditLogger.log({
      userId: user.id || user.user_id,
      actionType: 'DEPOSIT_REFUND_DISPUTED',
      entityId: leaseId,
      entityType: 'lease',
      details: { notes },
    });

    // 5. [SIDE EFFECT] Notify Staff (Owner & Treasurers) of the dispute
    try {
      const propertyResult = await pool.query(
        'SELECT owner_id FROM properties WHERE property_id = (SELECT unit_id FROM leases WHERE lease_id = ?)',
        [leaseId]
      );
      const ownerId = propertyResult?.[0]?.[0]?.owner_id;
      if (ownerId)
        await notificationModel.create({
          userId: ownerId,
          message: `Refund Dispute for Lease #${leaseId}. Notes: ${notes}`,
          type: 'lease',
          severity: 'warning',
          entityType: 'lease',
          entityId: leaseId,
        });

      const treasurers = await userModel.findByRole(ROLES.TREASURER);
      for (const t of treasurers) {
        await notificationModel.create({
          userId: t.id || t.user_id,
          message: `Refund dispute filed for Lease #${leaseId}.`,
          type: 'lease',
          severity: 'warning',
          entityType: 'lease',
          entityId: leaseId,
        });
      }
    } catch (err) {
      console.warn('Dispute notification failed:', err);
    }

    return { status: 'disputed' };
  }

  // ACKNOWLEDGE REFUND: Tenant agrees to the proposed settlement.
  async acknowledgeRefund(leaseId, tenantId) {
    // 1. Fetch lease and validate ownership
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new AppError('Lease not found', 404);
    if (String(lease.tenantId) !== String(tenantId))
      throw new AppError('Access denied: Ownership required.', 403);

    if (lease.depositStatus !== 'awaiting_acknowledgment') {
      throw new AppError(
        'No settlement is currently awaiting acknowledgment.',
        400
      );
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 2. Perform atomic status transition
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
        { depositStatus: finalStatus },
        connection
      );

      // 3. [AUDIT] Log the tenant's acceptance
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

  // RESOLVE REFUND DISPUTE: Staff revises the settlement offer after a dispute.
  async resolveRefundDispute(leaseId, user, adjustedAmount) {
    // 1. [SECURITY] Role and validation check
    if (adjustedAmount === undefined || adjustedAmount < 0)
      throw new AppError('Valid adjustedAmount required', 400);
    if (!isAtLeast(user.role, ROLES.TREASURER))
      throw new AppError('Access denied: Staff only.', 403);

    // 2. Fetch lease and ensure it's in disputed state
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new AppError('Lease not found', 404);
    if (lease.depositStatus !== 'disputed')
      throw new AppError('Only disputed refunds can be resolved.', 400);

    // 3. [SECURITY] Ledger guard: revised amount cannot exceed total held
    const ledgerBalance = await leaseModel.getDepositBalance(leaseId);
    if (adjustedAmount > ledgerBalance)
      throw new AppError(`Adjusted refund exceeds ledger balance.`, 400);

    // 4. Revert to 'awaiting_acknowledgment' with the new amount
    await leaseModel.update(leaseId, {
      depositStatus: 'awaiting_acknowledgment',
      proposedRefundAmount: adjustedAmount,
    });

    // 5. [AUDIT] Log the resolution
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

    // 6. [SIDE EFFECT] Notify Tenant of revised offer (Notification + Email)
    await notificationModel.create({
      userId: lease.tenantId,
      message: `A revised refund offer has been made: LKR ${fromCents(adjustedAmount).toLocaleString()}.`,
      type: 'lease',
      severity: 'info',
      entityType: 'lease',
      entityId: leaseId,
    });

    try {
      const tenant = await userModel.findById(lease.tenantId);
      if (tenant?.email) {
        const mailer = (await import('../utils/emailService.js')).default;
        await mailer.sendGenericNotification(tenant.email, {
          subject: 'Revised Refund Offer',
          message: `Staff has updated the refund offer for your lease. New amount: LKR ${fromCents(adjustedAmount).toLocaleString()}.`,
        });
      }
    } catch (err) {
      console.error('Refund resolution email failed:', err);
    }

    return {
      status: 'awaiting_acknowledgment',
      proposedRefundAmount: adjustedAmount,
    };
  }

  // UPDATE DISBURSEMENT REFERENCE: Corrections tool for bank reference numbers.
  async updateDisbursementReference(leaseId, newReference, user) {
    // 1. [SECURITY] RBAC check
    if (!isAtLeast(user.role, ROLES.TREASURER))
      throw new AppError('Access denied', 403);

    // 2. Fetch lease and ensure finalized status
    const lease = await leaseModel.findById(leaseId);
    if (!lease) throw new AppError('Lease not found', 404);
    if (lease.depositStatus !== 'refunded')
      throw new AppError(
        'Reference can only be updated for finalized settlements.',
        400
      );

    // 3. Update record and log audit trail
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

  // REFUND DEPOSIT: Backward-compatible shortcut for initiating requests.
  async refundDeposit(leaseId, amount, user) {
    // Branching logic based on role (Owners/Managers vs Treasurers)
    const notes = isAtLeast(user.role, ROLES.OWNER)
      ? 'Direct refund request'
      : 'Refund request by treasurer';
    return await this.facade.requestRefund(leaseId, amount, notes, user);
  }
}

export default LeaseRefundService;
