import pool from '../config/db.js';
import { randomUUID } from 'crypto';
import paymentModel from '../models/paymentModel.js';
import invoiceModel from '../models/invoiceModel.js';
import notificationModel from '../models/notificationModel.js';
import userModel from '../models/userModel.js';
import receiptModel from '../models/receiptModel.js';
import behaviorLogModel from '../models/behaviorLogModel.js';
import tenantModel from '../models/tenantModel.js';
import leaseModel from '../models/leaseModel.js';
import auditLogger from '../utils/auditLogger.js';
import ledgerModel from '../models/ledgerModel.js';
import emailService from '../utils/emailService.js';
import { today, now, parseLocalDate } from '../utils/dateUtils.js';
import authorizationService from './authorizationService.js';
import { ROLES } from '../utils/roleUtils.js';
import { fromCents, toCentsFromMajor } from '../utils/moneyUtils.js';
import unitModel from '../models/unitModel.js';
import leadModel from '../models/leadModel.js';
import staffModel from '../models/staffModel.js';

/**
 * Maps an invoice_type to the correct accounting ledger classification.
 */
function getLedgerClassification(invoiceType) {
  switch (invoiceType) {
    case 'deposit':
      return { accountType: 'liability', category: 'deposit_held' };
    case 'rent':
      return { accountType: 'revenue', category: 'rent' };
    case 'late_fee':
      return { accountType: 'revenue', category: 'late_fee' };
    case 'maintenance':
      return { accountType: 'revenue', category: 'maintenance' };
    default:
      return { accountType: 'revenue', category: 'other' };
  }
}

class PaymentService {
  async submitPayment(data, tenantId, file) {
    const { invoiceId, amount, paymentDate, paymentMethod, referenceNumber } =
      data;
    let evidenceUrl = data.evidenceUrl;

    if (file) {
      if (!file.url) {
        throw new Error('Payment evidence file is corrupted or missing path.');
      }
      evidenceUrl = file.url;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Integrity Check: Is invoice already paid?
      const [invoices] = await connection.query(
        'SELECT * FROM rent_invoices WHERE invoice_id = ?',
        [invoiceId]
      );
      const invoice = invoices[0];

      if (!invoice) throw new Error('Invoice not found');
      if (String(invoice.lease_id) && invoice.status === 'paid') {
        throw new Error('This invoice has already been paid.');
      }

      // Authorization
      const [leases] = await connection.query(
        'SELECT tenant_id FROM leases WHERE lease_id = ?',
        [invoice.lease_id]
      );
      if (!leases[0] || String(leases[0].tenant_id) !== String(tenantId)) {
        throw new Error('Access denied. This invoice does not belong to you.');
      }

      // Concurrency Control: One pending payment at a time
      const [pendingPayments] = await connection.query(
        "SELECT payment_id FROM payments WHERE invoice_id = ? AND status = 'pending'",
        [invoiceId]
      );
      if (pendingPayments.length > 0) {
        throw new Error(
          'You already have a pending payment for this invoice. Please wait for verification.'
        );
      }

      const centsAmount = toCentsFromMajor(amount);
      const paymentId = await paymentModel.create(
        {
          invoiceId,
          amount: centsAmount,
          paymentDate,
          paymentMethod,
          referenceNumber,
          evidenceUrl,
        },
        connection
      );

      // Notify Treasurers
      const [treasurers] = await connection.query(
        "SELECT user_id FROM users WHERE role = 'treasurer' AND status = 'active'"
      );
      for (const t of treasurers) {
        await notificationModel.create(
          {
            userId: t.user_id,
            message: `New Payment submitted for Invoice #${invoiceId} (Amount: ${fromCents(centsAmount).toFixed(2)}).`,
            type: 'payment',
            entityType: 'payment',
            entityId: paymentId,
          },
          connection
        );
      }

      await connection.commit();
      return paymentId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async submitGuestPayment(data, magicToken, file) {
    const { paymentDate, paymentMethod, referenceNumber } = data;
    let evidenceUrl = data.evidenceUrl;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Verify Magic Token
      const invoice = await invoiceModel.findByMagicToken(
        magicToken,
        connection
      );
      if (!invoice) throw new Error('Invalid or expired payment link.');

      if (invoice.status === 'paid') {
        throw new Error('This invoice has already been paid.');
      }

      // [HARDENED] Deterministic Locking Order (Unit -> Lease)
      // Replaced the heavy JOIN ... FOR UPDATE which locked both tables simultaneously (high deadlock risk).

      // 1. Lock Unit first
      const unit = await unitModel.findByIdForUpdate(
        invoice.unitId,
        connection
      );
      if (!unit) throw new Error('Unit not found.');

      // 2. Lock Lease second
      const lease = await leaseModel.findByIdForUpdate(
        invoice.leaseId,
        connection
      );
      if (!lease) throw new Error('Lease reference not found.');

      if (unit.status === 'maintenance') {
        throw new Error(
          'This unit is currently undergoing emergency maintenance or repair. Please contact the property manager before proceeding.'
        );
      }

      if (lease.status === 'cancelled') {
        throw new Error(
          'This lease offer has expired or been cancelled. Please contact the property manager.'
        );
      }

      // Atomic Overlap Check: Ensure no one ELSE has already submitted a payment for this unit during these dates.
      // This is the "Hard Reservation Lock" mentioned in the audit.
      const [overlappingPayments] = await connection.query(
        `SELECT p.payment_id 
                 FROM payments p
                 JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
                 JOIN leases l ON ri.lease_id = l.lease_id
                 WHERE l.unit_id = ? 
                 AND l.lease_id != ?
                 AND p.status IN ('pending', 'verified')
                 AND l.status IN ('active', 'draft')
                 AND l.start_date <= ? 
                 AND (l.end_date IS NULL OR l.end_date >= ?)`,
        [
          lease.unitId,
          invoice.lease_id,
          lease.endDate || '2099-12-31',
          lease.startDate,
        ]
      );

      if (overlappingPayments.length > 0) {
        throw Object.assign(
          new Error(
            `This unit already has a pending or confirmed deposit from another applicant. Please contact the property manager.`
          ),
          { statusCode: 409 }
        );
      }

      const invoiceId = invoice.id;
      const amount = invoice.amount; // Guests must pay the full amount for the deposit to "hold" the unit

      // [NEW] Link Payment to Lead: Mark lead as 'Payment Pending' in notes
      try {
        const leadId = await leadModel.findIdByEmailAndProperty(
          invoice.tenant_email || invoice.email,
          unit.propertyId || unit.property_id
        );
        if (leadId) {
          await leadModel.update(
            leadId,
            {
              notes:
                `[SYSTEM: DEPOSIT PAYMENT SUBMITTED - ${new Date().toLocaleDateString()}]\n` +
                (invoice.notes || ''),
            },
            connection
          );
        }
      } catch (leadErr) {
        console.error(
          '[PaymentService] Failed to update lead status note:',
          leadErr
        );
      }

      if (file) {
        if (!file.url) {
          throw new Error(
            'Payment evidence file is corrupted or missing path.'
          );
        }
        evidenceUrl = file.url;
      }

      // 2. Concurrency Control: One pending payment at a time (for this specific invoice)
      const [pendingPayments] = await connection.query(
        "SELECT payment_id FROM payments WHERE invoice_id = ? AND status = 'pending'",
        [invoiceId]
      );
      if (pendingPayments.length > 0) {
        throw new Error(
          'You already have a pending payment for this invoice. Please wait for verification.'
        );
      }

      const paymentId = await paymentModel.create(
        {
          invoiceId,
          amount,
          paymentDate,
          paymentMethod,
          referenceNumber,
          evidenceUrl,
        },
        connection
      );

      // [ONBOARDING FIX] DO NOT clear the token after payment submission.
      // We want it to persist so the guest can track their verification status.
      // await invoiceModel.clearMagicToken(invoiceId, connection);

      // 3. Notify Treasurers
      const [treasurers] = await connection.query(
        "SELECT user_id FROM users WHERE role = 'treasurer' AND status = 'active'"
      );
      for (const t of treasurers) {
        await notificationModel.create(
          {
            userId: t.user_id,
            message: `GUEST PAYMENT: New Deposit submitted via Magic Link for Unit ${invoice.unitNumber} (Amount: ${fromCents(amount).toFixed(2)}).`,
            type: 'payment',
            entityType: 'payment',
            entityId: paymentId,
          },
          connection
        );
      }

      await connection.commit();
      return paymentId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async _postToLedger(paymentId, invoice, amount, description, connection) {
    const { accountType, category } = getLedgerClassification(
      invoice.invoiceType || invoice.invoice_type
    );
    return await ledgerModel.create(
      {
        paymentId: Number(paymentId),
        invoiceId: invoice.id || invoice.invoice_id,
        leaseId: invoice.leaseId || invoice.lease_id,
        accountType,
        category,
        credit: Number(amount),
        description:
          description ||
          `Payment for ${invoice.description || invoice.invoice_type}`,
        entryDate: getCurrentDateString(),
      },
      connection
    );
  }

  /**
   * Records a payment that has already been verified by an automated gateway (e.g. PayHere).
   * Skips manual treasurer verification and triggers all post-payment workflows.
   */
  async recordAutomatedPayment(data, connection = null) {
    const { invoiceId, amount, paymentMethod, referenceNumber } = data;

    const conn = connection || (await pool.getConnection());
    const isExternalConn = !!connection;

    try {
      if (!isExternalConn) {
        await conn.beginTransaction();
      } else {
        // [NEW] Use Savepoint to allow partial rollback within an outer transaction
        await conn.query('SAVEPOINT record_automated_payment');
      }

      // [HARDENED] 1. Atomic Row Locking: Serialize concurrent requests for this invoice
      const invoice = await invoiceModel.findByIdForUpdate(invoiceId, conn);
      if (!invoice) throw new Error(`Invoice #${invoiceId} not found`);

      // [HARDENED] 2. Atomic Idempotency Check (Within protected row lock)
      const existingPayment = await paymentModel.findByReferenceNumber(
        referenceNumber,
        conn
      );
      let paymentId;

      if (existingPayment) {
        if (existingPayment.status === 'verified') {
          console.log(
            `[PaymentService] Idempotent trigger: Payment for ref ${referenceNumber} already verified. Skipping duplicate.`
          );
          if (!isExternalConn) await conn.rollback();
          return Number(existingPayment.id);
        }

        // [FIX] RECOVERY LOGIC: If a previously REJECTED or PENDING payment is confirmed by the gateway,
        // we update the existing record to 'verified' instead of trying to create a new one (which fails unique constraint).
        console.log(
          `[PaymentService] Recovery trigger: Updating existing ${existingPayment.status} payment (Ref: ${referenceNumber}) to verified.`
        );
        await paymentModel.updateStatus(
          existingPayment.id,
          'verified',
          null,
          conn
        );
        paymentId = Number(existingPayment.id);
      }

      // [SECURITY FIX] 100x Revenue Bleed and Tampering Guard
      const expectedCents = Number(invoice.amount);
      if (Number(amount) < expectedCents) {
        console.error(
          `[Security Alert] Underpayment detected for automated invoice #${invoiceId}. Expected ${expectedCents} cents, but received ${amount} cents.`
        );
        throw new Error(
          'Payment amount mismatch. Security verification failed.'
        );
      }

      if (!paymentId) {
        // 3. Create New Verified Payment
        try {
          paymentId = await paymentModel.create(
            {
              invoiceId,
              amount,
              paymentDate: today(),
              paymentMethod: paymentMethod || 'online',
              referenceNumber,
              evidenceUrl: null,
              status: 'verified',
            },
            conn
          );
        } catch (dupErr) {
          if (dupErr.code === 'ER_DUP_ENTRY') {
            // Concurrent request beat us to it right after the SELECT but before our lock?
            // Or just finished its transaction.
            const fallback = await paymentModel.findByReferenceNumber(
              referenceNumber,
              conn
            );
            if (fallback) return Number(fallback.id);
          }
          throw dupErr;
        }
      }

      const payment = await paymentModel.findById(paymentId, conn);

      // 2. Finalize actions (ledger, receipt, activation, notifications)
      // Use a dummy system user for automated actions
      const systemUser = { id: null, role: 'system' };
      await this._finalizeVerifiedPayment(
        paymentId,
        invoice,
        payment,
        systemUser,
        conn
      );

      if (!isExternalConn) {
        await conn.commit();
      } else {
        await conn.query('RELEASE SAVEPOINT record_automated_payment');
      }

      // 3. Fire-and-forget emails
      try {
        const tenant = await userModel.findById(
          invoice.tenantId || invoice.tenant_id,
          conn
        );
        if (tenant && tenant.email) {
          await emailService.sendPaymentConfirmation(tenant.email, {
            amount: amount,
            paymentMethod: paymentMethod || 'online',
            referenceNumber,
            invoiceId: invoiceId,
          });
        }
      } catch (emailErr) {
        console.error(
          'Failed to send automated payment confirmation email:',
          emailErr
        );
      }

      return paymentId;
    } catch (error) {
      if (!isExternalConn) {
        await conn.rollback();
      } else {
        await conn.query('ROLLBACK TO SAVEPOINT record_automated_payment');
      }
      console.error('[PaymentService] Automated Payment Failed:', error);
      throw error;
    } finally {
      if (!isExternalConn) conn.release();
    }
  }

  async verifyPayment(
    paymentId,
    status,
    user,
    reason = null,
    connection = null
  ) {
    if (!authorizationService.isAtLeast(user.role, ROLES.TREASURER)) {
      throw new Error(
        'Access denied. Only Treasurers (or Owners) can verify payments.'
      );
    }

    const conn = connection || (await pool.getConnection());
    const isOwnTransaction = !connection;
    try {
      if (isOwnTransaction) await conn.beginTransaction();

      const payment = await paymentModel.findById(paymentId, conn);
      if (!payment) throw new Error('Payment not found');

      const invoice = await invoiceModel.findById(
        payment.invoiceId || payment.invoice_id,
        conn
      );
      if (!invoice) throw new Error('Invoice not found');

      // [C3 FIX - Problem 3] Block verification for voided/cancelled invoices
      if (invoice.status === 'void' || invoice.status === 'cancelled') {
        throw new Error(
          'Cannot verify payment for a voided or cancelled invoice.'
        );
      }

      // [C3 FIX - Problem 2] Strict Treasurer Assignment RBAC
      const lease = await leaseModel.findById(
        invoice.leaseId || invoice.lease_id,
        conn
      );
      if (!lease) throw new Error('Lease not found');

      const unit = await unitModel.findById(
        lease.unitId || lease.unit_id,
        conn
      );

      const assignedProperties = await staffModel.getAssignedProperties(
        user.id,
        conn
      );
      if (
        !assignedProperties.some(
          (p) =>
            String(p.property_id) ===
            String(unit.propertyId || unit.property_id)
        )
      ) {
        throw new Error(
          'Access denied. You are not assigned to this property.'
        );
      }

      const { payment: updatedPayment, changed } =
        await paymentModel.updateStatus(paymentId, status, null, conn);

      // [C3 FIX - Problem 4] Concurrency Lock: Throw explicit error on Idempotency catch
      if (!changed) {
        if (isOwnTransaction) await conn.rollback();
        throw new Error(
          'This payment was already verified or rejected by another user.'
        );
      }

      if (status === 'verified') {
        const payment = updatedPayment;
        if (payment) {
          await this._finalizeVerifiedPayment(
            paymentId,
            invoice,
            payment,
            user,
            conn
          );
        }
      } else if (status === 'rejected') {
        const payment = updatedPayment;
        if (payment) {
          const allPayments = await paymentModel.findByInvoiceId(
            payment.invoiceId,
            conn
          );
          const totalVerified = allPayments
            .filter((p) => p.status === 'verified')
            .reduce((sum, p) => sum + Number(p.amount), 0);

          if (totalVerified < invoice.amount) {
            let newStatus;
            if (totalVerified > 0) {
              newStatus = 'partially_paid';
            } else {
              const isOverdue = now() > parseLocalDate(invoice.due_date);
              newStatus = isOverdue ? 'overdue' : 'pending';
            }
            await invoiceModel.updateStatus(
              invoice.invoice_id,
              newStatus,
              conn
            );
          }

          if (invoice.invoice_type === 'deposit') {
            await leaseModel.update(
              invoice.lease_id,
              {
                deposit_status: 'pending',
              },
              conn
            );

            // [FIX A] Release unit only if no verified funds remain for this deposit
            if (totalVerified === 0) {
              const [otherClaims] = await conn.query(
                `SELECT lease_id FROM leases 
                 WHERE unit_id = ? AND lease_id != ? 
                 AND status IN ('active', 'draft', 'pending')`,
                [lease.unitId || lease.unit_id, invoice.lease_id]
              );
              if (otherClaims.length === 0) {
                await conn.query(
                  `UPDATE units SET status = 'available' WHERE unit_id = ? AND status = 'reserved'`,
                  [lease.unitId || lease.unit_id]
                );
                // Collapse the expiry window to allow cron cleanup
                await conn.query(
                  `UPDATE leases SET reservation_expires_at = NOW() WHERE lease_id = ?`,
                  [invoice.lease_id]
                );
              }
            }
          }

          const rejectMessage = reason
            ? `Payment of ${fromCents(payment.amount).toFixed(2)} for Invoice #${payment.invoiceId} was rejected. Reason: ${reason}`
            : `Payment of ${fromCents(payment.amount).toFixed(2)} for Invoice #${payment.invoiceId} was rejected. Please contact support.`;

          await notificationModel.create(
            {
              userId: invoice.tenantId || invoice.tenant_id,
              message: rejectMessage,
              type: 'payment',
              severity: 'urgent',
              entityType: 'payment',
              entityId: paymentId,
            },
            conn
          );

          await auditLogger.log(
            {
              userId: user.user_id || user.id,
              actionType: 'PAYMENT_REJECTED',
              entityId: paymentId,
              entityType: 'payment',
              details: {
                invoiceId: payment.invoiceId,
                amount: payment.amount,
                reason,
              },
            },
            { user: user },
            conn
          );
        }
      }

      if (isOwnTransaction) await conn.commit();

      // Fire-and-forget emails outside transaction
      if (status === 'verified') {
        const invoice = await invoiceModel.findById(updatedPayment.invoiceId);
        try {
          const tenant = await userModel.findById(
            invoice.tenantId || invoice.tenant_id
          );
          if (tenant && tenant.email) {
            await emailService.sendPaymentConfirmation(tenant.email, {
              amount: updatedPayment.amount,
              paymentMethod: updatedPayment.paymentMethod,
              referenceNumber: updatedPayment.referenceNumber,
              invoiceId: updatedPayment.invoiceId,
            });
          }
        } catch (emailErr) {
          console.error('Failed to send payment verification email:', emailErr);
        }
      } else if (status === 'rejected') {
        const invoice = await invoiceModel.findById(updatedPayment.invoiceId);
        try {
          const tenant = await userModel.findById(
            invoice.tenantId || invoice.tenant_id
          );
          if (tenant && tenant.email) {
            await emailService.sendPaymentRejection(tenant.email, {
              amount: updatedPayment.amount,
              invoiceId: updatedPayment.invoiceId,
              reason: reason,
            });
          }
        } catch (emailErr) {
          console.error('Failed to send payment rejection email:', emailErr);
        }
      }

      return updatedPayment;
    } catch (error) {
      if (isOwnTransaction) await conn.rollback();
      console.error('Verify Payment Transaction Failed:', error);
      throw error;
    } finally {
      if (isOwnTransaction) conn.release();
    }
  }

  /**
   * Shared logic for finalizing a verified payment.
   * Handles invoice status updates, ledger entries, receipts, notifications,
   * and auto-lease activation.
   */
  async _finalizeVerifiedPayment(
    paymentId,
    invoice,
    payment,
    user,
    connection
  ) {
    // Logic Check: Partial Payments
    const allPayments = await paymentModel.findByInvoiceId(
      payment.invoiceId,
      connection
    );
    const totalVerified = allPayments
      .filter((p) => p.status === 'verified')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    // Lease Status Warning
    const lease = await leaseModel.findById(invoice.leaseId, connection);
    if (lease && lease.status === 'ended') {
      console.warn(
        `Verified payment ${paymentId} for invoice linked to ENDED lease ${lease.id}`
      );
    }

    const previousVerified = totalVerified - Number(payment.amount);
    const amountAppliedToInvoice = Math.min(
      Number(payment.amount),
      Math.max(0, invoice.amount - previousVerified)
    );
    const incrementalOverpayment =
      Number(payment.amount) - amountAppliedToInvoice;

    if (totalVerified >= invoice.amount) {
      await invoiceModel.updateStatus(payment.invoiceId, 'paid', connection);

      // [F2.12] Positive behavior scoring for on-time payment
      try {
        const invType =
          invoice.type || invoice.invoiceType || invoice.invoice_type;
        if (invType === 'rent') {
          const { parseLocalDate } = await import('../utils/dateUtils.js');
          const behaviorLogModel = (
            await import('../models/behaviorLogModel.js')
          ).default;

          const dueDate = parseLocalDate(invoice.dueDate || invoice.due_date);
          const paymentDate = parseLocalDate(
            payment.paymentDate || payment.payment_date
          );
          const daysEarly = Math.floor(
            (dueDate - paymentDate) / (1000 * 60 * 60 * 24)
          );
          const scoreChange = daysEarly >= 5 ? 10 : 5;

          await behaviorLogModel.create(
            {
              tenantId: invoice.tenantId || invoice.tenant_id,
              type: 'positive',
              category: 'Payment',
              scoreChange,
              description: `On-time rent payment for invoice #${payment.invoiceId}`,
              recordedBy: null,
            },
            connection
          );

          await tenantModel.incrementBehaviorScore(
            invoice.tenantId || invoice.tenant_id,
            scoreChange,
            connection
          );
        }
      } catch (scoreErr) {
        console.warn(
          'Failed to apply positive behavior score:',
          scoreErr.message
        );
      }

      // Overpayment Logic (Bug B5 Fix)
      if (incrementalOverpayment > 0) {
        await tenantModel.addCredit(
          invoice.tenantId,
          incrementalOverpayment,
          connection,
          'overpayment',
          paymentId
        );
        await notificationModel.create(
          {
            userId: invoice.tenantId,
            message: `Overpayment of ${fromCents(incrementalOverpayment).toFixed(2)} has been credited to your account balance.`,
            type: 'payment',
            entityType: 'payment',
            entityId: paymentId,
          },
          connection
        );
      }
    } else if (totalVerified > 0) {
      await invoiceModel.updateStatus(
        payment.invoiceId,
        'partially_paid',
        connection
      );
    }

    // Generate Receipt
    const existingReceipt = await receiptModel.findByPaymentId(
      paymentId,
      connection
    );
    if (!existingReceipt) {
      await receiptModel.create(
        {
          paymentId: paymentId,
          invoiceId: payment.invoiceId,
          tenantId: invoice.tenantId || invoice.tenant_id,
          amount: payment.amount,
          generatedDate: today(),
          receiptNumber: `REC-${randomUUID()}`,
        },
        connection
      );

      // [CRITICAL FIX] Post Ledger Entry BEFORE activation
      // This ensures that lease status checks (deposit balance) can see the verified funds.
      await this._postToLedger(
        paymentId,
        invoice,
        payment.amount,
        `Payment verified for ${invoice.description || invoice.invoiceType}`,
        connection
      );

      // Deposit Status Logic
      if (
        invoice.invoiceType === 'deposit' ||
        invoice.invoice_type === 'deposit'
      ) {
        const finalInvoice = await invoiceModel.findById(
          payment.invoiceId,
          connection
        );
        const finalStatus = finalInvoice.status === 'paid' ? 'paid' : 'pending';

        // [NEW] Extend reservation to 7 days from creation once deposit is paid (to allow doc verification)
        const extendedExpiry = formatToLocalDate(
          addDays(new Date(lease.createdAt), 7)
        );

        await leaseModel.update(
          invoice.leaseId,
          {
            depositStatus: finalStatus,
            reservationExpiresAt: extendedExpiry, // Give them 7 full days from creation
          },
          connection
        );

        const auditLogger = (await import('../utils/auditLogger.js')).default;
        await auditLogger.log(
          {
            userId: null,
            actionType: 'RESERVATION_EXTENDED',
            entityId: invoice.leaseId,
            entityType: 'lease',
            details: {
              newExpiry: extendedExpiry,
              reason: 'Deposit payment received',
            },
          },
          null,
          connection
        );
      }

      // Notify Tenant
      await notificationModel.create(
        {
          userId: invoice.tenantId || invoice.tenant_id,
          message: `Payment of ${fromCents(payment.amount).toFixed(2)} for Invoice #${payment.invoiceId} has been verified.`,
          type: 'payment',
          entityType: 'payment',
          entityId: paymentId,
        },
        connection
      );

      // [AUTO-ACTIVATION] If full deposit is paid on a draft lease, activate it immediately.
      const finalInvoice = await invoiceModel.findById(
        payment.invoiceId,
        connection
      );
      if (
        finalInvoice.status === 'paid' &&
        (invoice.invoiceType === 'deposit' ||
          invoice.invoice_type === 'deposit')
      ) {
        const lease = await leaseModel.findById(invoice.leaseId, connection);
        if (lease && lease.status === 'draft') {
          if (lease.isDocumentsVerified) {
            try {
              const leaseService = (await import('./leaseService.js')).default;
              await leaseService.signLease(lease.id, user, connection);

              // Trigger Onboarding (Set Password email)
              const userService = (await import('./userService.js')).default;
              await userService.triggerOnboarding(lease.tenantId, connection);
            } catch (activationErr) {
              console.error(
                `[PaymentService] Auto-activation blocked for Lease #${lease.id}:`,
                activationErr.message
              );

              // Notify Staff that payment is received but activation is blocked by unit status
              const [propertyInfo] = await connection.query(
                'SELECT owner_id FROM properties WHERE property_id = ?',
                [lease.propertyId]
              );
              const ownerId = propertyInfo[0]?.owner_id;

              const [assignedStaff] = await connection.query(
                'SELECT user_id FROM staff_property_assignments WHERE property_id = ?',
                [lease.propertyId]
              );

              const userIdsToNotify = new Set();
              if (ownerId) userIdsToNotify.add(ownerId);
              assignedStaff.forEach((s) => userIdsToNotify.add(s.user_id));

              for (const userId of userIdsToNotify) {
                await notificationModel.create(
                  {
                    userId: userId,
                    message: `URGENT: Deposit Paid for Lease #${lease.id} (Unit ${lease.unitNumber}), but AUTO-ACTIVATION was BLOCKED by Unit Status (${activationErr.message}). Manual check required.`,
                    type: 'lease',
                    severity: 'urgent',
                    entityType: 'lease',
                    entityId: lease.id,
                  },
                  connection
                );
              }
            }
          } else {
            // Notify Treasurers and Owners that payment is done but documents need review
            const [propertyInfo] = await connection.query(
              'SELECT owner_id FROM properties WHERE property_id = ?',
              [lease.propertyId]
            );
            const ownerId = propertyInfo[0]?.owner_id;

            const [assignedStaff] = await connection.query(
              'SELECT user_id FROM staff_property_assignments WHERE property_id = ?',
              [lease.propertyId]
            );

            const userIdsToNotify = new Set();
            if (ownerId) userIdsToNotify.add(ownerId);
            assignedStaff.forEach((s) => userIdsToNotify.add(s.user_id));

            for (const userId of userIdsToNotify) {
              await notificationModel.create(
                {
                  userId: userId,
                  message: `URGENT: Deposit Paid for Lease #${lease.id} (Unit ${lease.unitNumber}). Documents are PENDING verification. Please review and activate.`,
                  type: 'lease',
                  severity: 'urgent',
                },
                connection
              );
            }
          }
        }
      }

      await auditLogger.log(
        {
          userId: user?.user_id || user?.id || null,
          actionType: 'PAYMENT_VERIFIED',
          entityId: paymentId,
          entityType: 'payment',
          details: {
            invoiceId: payment.invoiceId,
            amount: payment.amount,
            automated: user.role === 'system',
          },
        },
        null,
        connection
      );

      // Behavior Score
      try {
        const paymentDate = parseLocalDate(payment.paymentDate || today());
        const dueDate = parseLocalDate(invoice.dueDate);
        const payStr = formatToLocalDate(paymentDate);
        const dueStr = formatToLocalDate(dueDate);

        if (payStr <= dueStr) {
          await behaviorLogModel.logPositivePayment(
            invoice.tenantId || invoice.tenant_id,
            5,
            connection
          );
          await tenantModel.incrementBehaviorScore(
            invoice.tenantId || invoice.tenant_id,
            5,
            connection
          );
        }
      } catch (scoreErr) {
        console.error('Failed to update positive score:', scoreErr);
      }
    }
  }

  async getPayments(user) {
    if (user.role === 'tenant') {
      return await paymentModel.findByTenantId(user.id);
    } else if (user.role === 'treasurer') {
      return await paymentModel.findByTreasurerId(user.id);
    } else if (user.role === 'owner') {
      return await paymentModel.findByOwnerId(user.id);
    } else {
      throw new Error('Access denied');
    }
  }

  /**
   * Automatically applies any existing credit balance from the tenant's record
   * to a specific invoice. Reduces the "Balance Due" by creating a 'credit_applied' payment.
   */
  async applyTenantCredit(invoiceId, connection = null) {
    const db = connection || pool;
    const isExternalConn = !!connection;
    const conn = isExternalConn ? connection : await pool.getConnection();

    try {
      if (!isExternalConn) await conn.beginTransaction();

      // 1. Fetch Invoice
      const invoice = await invoiceModel.findById(invoiceId, conn);
      if (!invoice) throw new Error(`Invoice #${invoiceId} not found`);
      if (invoice.status === 'paid') {
        if (!isExternalConn) await conn.rollback();
        return null;
      }

      // 2. Fetch Tenant Credit Balance
      const tenant = await tenantModel.findByUserId(invoice.tenantId, conn);
      if (!tenant || tenant.creditBalance <= 0) {
        if (!isExternalConn) await conn.rollback();
        return null;
      }

      // 3. Calculate Amount to Apply (Balance Due check)
      const allPayments = await paymentModel.findByInvoiceId(invoiceId, conn);
      const totalVerified = allPayments
        .filter((p) => p.status === 'verified')
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const remainingDue = Math.max(0, invoice.amount - totalVerified);
      if (remainingDue <= 0) {
        if (!isExternalConn) await conn.rollback();
        return null;
      }

      const amountToApply = Math.min(tenant.creditBalance, remainingDue);
      if (amountToApply <= 0) {
        if (!isExternalConn) await conn.rollback();
        return null;
      }

      // 4. Create Verified 'credit_applied' Payment
      const payId = await paymentModel.create(
        {
          invoiceId,
          amount: amountToApply,
          paymentDate: today(),
          paymentMethod: 'credit_applied',
          referenceNumber: `CREDIT-${Date.now()}`,
          evidenceUrl: null,
        },
        conn
      );
      await paymentModel.updateStatus(payId, 'verified', null, conn);

      // 5. Update Tenant Balance
      await tenantModel.deductCredit(
        invoice.tenantId,
        amountToApply,
        conn,
        'invoice_payment',
        invoiceId
      );

      // 6. Update Invoice Status
      const newTotalVerified = totalVerified + amountToApply;
      if (newTotalVerified >= invoice.amount) {
        await invoiceModel.updateStatus(invoiceId, 'paid', conn);
      } else {
        await invoiceModel.updateStatus(invoiceId, 'partially_paid', conn);
      }

      // 7. Generate Receipt
      await receiptModel.create(
        {
          paymentId: payId,
          invoiceId,
          tenantId: invoice.tenantId,
          amount: amountToApply,
          generatedDate: today(),
          receiptNumber: `REC-CREDIT-${randomUUID()}`,
        },
        conn
      );

      // 8. Post Ledger Entry (Centralized classification)
      await this._postToLedger(
        payId,
        invoice,
        amountToApply,
        `Auto-applied credit from tenant balance to invoice #${invoiceId}`,
        conn
      );

      // 9. Notify Tenant
      await notificationModel.create(
        {
          userId: invoice.tenantId,
          message: `LKR ${fromCents(amountToApply).toFixed(2)} from your account balance was automatically applied to Invoice #${invoiceId}.`,
          type: 'payment',
          entityType: 'payment',
          entityId: payId,
        },
        conn
      );

      if (!isExternalConn) await conn.commit();
      console.log(
        `[PaymentService] Auto-applied ${amountToApply} credit to Invoice #${invoiceId} for Tenant ${invoice.tenantId}`
      );

      return { paymentId: payId, amountApplied: amountToApply };
    } catch (error) {
      if (!isExternalConn) await conn.rollback();
      console.error(
        `[PaymentService] Failed to apply tenant credit to Invoice #${invoiceId}:`,
        error
      );
      throw error;
    } finally {
      if (!isExternalConn) conn.release();
    }
  }
}

export default new PaymentService();
