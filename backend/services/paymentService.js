// ============================================================================
//  PAYMENT SERVICE (The Financial Record Keeper)
// ============================================================================
//  This service manages all movement of money into the system.
//  It handles payment submissions, manual & automated verifications,
//  ledger bookkeeping, and the generation of receipts.
// ============================================================================

import pool from '../config/db.js';
import paymentModel from '../models/paymentModel.js';
import invoiceModel from '../models/invoiceModel.js';
import tenantModel from '../models/tenantModel.js';
import leaseModel from '../models/leaseModel.js';
import { today, parseLocalDate, now } from '../utils/dateUtils.js';
import { fromCents, toCentsFromMajor, moneyMath } from '../utils/moneyUtils.js';
import unitModel from '../models/unitModel.js';
import leadModel from '../models/leadModel.js';
import ledgerService from './ledgerService.js';
import receiptService from './receiptService.js';
import paymentSideEffectService from './paymentSideEffectService.js';
import paymentOperationalService from './paymentOperationalService.js';
import { ROLES, isAtLeast } from '../utils/roleUtils.js';
import authorizationService from './authorizationService.js';
import staffModel from '../models/staffModel.js';
import propertyModel from '../models/propertyModel.js';
import logger from '../utils/logger.js';

// Restored for un-refactored methods
import notificationModel from '../models/notificationModel.js';
import auditLogger from '../utils/auditLogger.js';
import userModel from '../models/userModel.js';
import emailService from '../utils/emailService.js';
import unitLockService from './unitLockService.js';

/**
 * Maps an invoice_type to the correct accounting ledger classification.
 */
// [REMOVED] getLedgerClassification is now encapsulated within LedgerService.js

class PaymentService {
  // SUBMIT PAYMENT: Saves a payment slip or details sent by a tenant for review.
  async submitPayment(data, tenantId, file) {
    // 1. Extract payment details from request body
    const { invoiceId, amount, paymentDate, paymentMethod, referenceNumber } =
      data;
    let evidenceUrl = data.evidenceUrl;

    // 2. Process file upload if present (bank slips, etc.)
    if (file) {
      if (!file.url) {
        throw new Error('Payment evidence file is corrupted or missing path.');
      }
      evidenceUrl = file.url;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 3. Integrity Check: Is invoice already paid?
      const invoice = await invoiceModel.findById(invoiceId, connection);

      if (!invoice) throw new Error('Invoice not found');
      if (invoice.leaseId && invoice.status === 'paid') {
        throw new Error('This invoice has already been paid.');
      }

      // 4. Authorization: Ensure tenant owns the invoice
      const lease = await leaseModel.findById(invoice.leaseId, connection);
      if (!lease || String(lease.tenantId) !== String(tenantId)) {
        throw new Error('Access denied. This invoice does not belong to you.');
      }

      // 5. Concurrency Control: Prevent duplicate pending payments
      const pendingPayments = await paymentModel.findByInvoiceId(
        invoiceId,
        connection
      );
      if (pendingPayments.some((p) => p.status === 'pending')) {
        throw new Error(
          'You already have a pending payment for this invoice. Please wait for verification.'
        );
      }

      // 6. Create payment record in pending state
      const centsAmount = Number(amount);
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

      // 7. Notify Treasurers for manual review
      const treasurers = await userModel.findByRole(
        ROLES.TREASURER,
        connection
      );
      for (const t of treasurers) {
        if (t.status === 'active') {
          await notificationModel.create(
            {
              userId: t.id,
              message: `New Payment submitted for Invoice #${invoiceId} (Amount: ${fromCents(centsAmount).toFixed(2)}).`,
              type: 'payment',
              entityType: 'payment',
              entityId: paymentId,
            },
            connection
          );
        }
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

  // SUBMIT GUEST PAYMENT: Handles the special "Security Deposit" payment made by applicants during onboarding.
  async submitGuestPayment(data, magicToken, file) {
    // 1. Extract guest details
    const { paymentDate, paymentMethod, referenceNumber } = data;
    let evidenceUrl = data.evidenceUrl;

    const connection = await pool.getConnection();
    let lockUnitId = null;
    let lockLeadId = null;
    try {
      await connection.beginTransaction();

      // 2. Verify Magic Token for guest identification
      const invoice = await invoiceModel.findByMagicToken(
        magicToken,
        connection
      );
      if (!invoice) throw new Error('Invalid or expired payment link.');

      lockUnitId = invoice.unitId || invoice.unit_id;

      // [C9 FIX] Explicit expiry check as defense-in-depth
      if (
        invoice.magic_token_expires_at &&
        new Date(invoice.magic_token_expires_at) < new Date()
      ) {
        throw new Error('Payment link expired.');
      }

      if (invoice.status === 'paid') {
        throw new Error('This invoice has already been paid.');
      }

      // [HARDENED] Deterministic Locking Order (Unit -> Lease)
      // Replaced the heavy JOIN ... FOR UPDATE which locked both tables simultaneously (high deadlock risk).

      // 3. Lock Unit first (Parent resource)
      const unit = await unitModel.findByIdForUpdate(
        invoice.unitId,
        connection
      );
      if (!unit) throw new Error('Unit not found.');

      // 4. Lock Lease second (Child resource)
      const lease = await leaseModel.findByIdForUpdate(
        invoice.leaseId,
        connection
      );
      if (!lease) throw new Error('Lease reference not found.');

      // 5. Integrity Check: Ensure unit is not in emergency maintenance
      if (unit.status === 'maintenance') {
        throw new Error(
          'This unit is currently undergoing emergency maintenance or repair. Please contact the property manager before proceeding.'
        );
      }

      // 6. Integrity Check: Ensure lease offer is still active
      if (lease.status === 'cancelled') {
        throw new Error(
          'This lease offer has expired or been cancelled. Please contact the property manager.'
        );
      }

      // 7. [SECURITY] Atomic Overlap Check: Prevent double-booking race condition
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

      // 8. [AUDIT] Link Payment to Lead: Mark historical progress
      try {
        const leadId = await leadModel.findIdByEmailAndProperty(
          invoice.tenant_email || invoice.email,
          unit.propertyId || unit.property_id
        );
        if (leadId) {
          lockLeadId = leadId;
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
        logger.warn('[PaymentService] Failed to update lead status note:', {
          error: leadErr.message,
        });
      }

      // 9. Process file attachment
      if (file) {
        if (!file.url) {
          throw new Error(
            'Payment evidence file is corrupted or missing path.'
          );
        }
        evidenceUrl = file.url;
      }

      // 10. Concurrency Control: Prevent duplicate attempts for guest
      const invoicePending = await paymentModel.findByInvoiceId(
        invoiceId,
        connection
      );
      if (invoicePending.some((p) => p.status === 'pending')) {
        throw new Error(
          'You already have a pending payment for this invoice. Please wait for verification.'
        );
      }

      // 11. Create guest payment record
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

      // 12. Notify Treasurers of incoming guest deposit
      const guestTreasurers = await userModel.findByRole(
        ROLES.TREASURER,
        connection
      );
      for (const t of guestTreasurers) {
        if (t.status === 'active') {
          await notificationModel.create(
            {
              userId: t.id,
              message: `GUEST PAYMENT: New Deposit submitted via Magic Link for Unit ${invoice.unitNumber} (Amount: ${fromCents(amount).toFixed(2)}).`,
              type: 'payment',
              entityType: 'payment',
              entityId: paymentId,
            },
            connection
          );
        }
      }

      await connection.commit();

      return paymentId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      // [FIX] Release database connection first to avoid holding it during external network calls
      connection.release();

      // [NEW] Release Redis Lock unconditionally after checkout completes (success or fail)
      // The database state now reflects the pending payment, so the "soft lock" is no longer needed.
      if (lockUnitId) {
        try {
          // If lockLeadId wasn't set during the try block (e.g. error happened early),
          // we attempt a lightweight background query using the pool, NOT the transaction connection.
          if (!lockLeadId && magicToken) {
            const invoice = await invoiceModel.findByMagicToken(
              magicToken,
              pool
            );
            if (invoice && invoice.unitId) {
              lockLeadId = await leadModel.findIdByEmailAndProperty(
                invoice.tenant_email || invoice.email,
                invoice.propertyId || invoice.property_id || invoice.unitId
              );
            }
          }
          await unitLockService.releaseLock(lockUnitId, lockLeadId);
        } catch (lockErr) {
          logger.error('[PaymentService] Failed to release Redis lock:', {
            error: lockErr.message,
          });
        }
      }
    }
  }

  // [REMOVED] _postToLedger is now encapsulated within LedgerService.js

  /**
   * Records a payment that has already been verified by an automated gateway (e.g. PayHere).
   * Skips manual treasurer verification and triggers all post-payment workflows.
   */
  // RECORD AUTOMATED PAYMENT: Instantly logs a payment confirmed by an online gateway like Stripe.
  async recordAutomatedPayment(data, connection = null) {
    // 1. Setup transaction context
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

      // [CONCURRENCY FIX] Lock Lease Hierarchy (Unit -> Lease) for Deposit Payments
      // This prevents race conditions where staff reject documents while the webhook confirms payment.
      const invType =
        invoice.invoice_type || invoice.type || invoice.invoiceType;
      if (invType === 'deposit' && invoice.lease_id) {
        // Lock Unit first (Global Parent)
        const leaseData = await leaseModel.findById(invoice.lease_id, conn);
        if (leaseData?.unitId) {
          await unitModel.findByIdForUpdate(leaseData.unitId, conn);
        }
        // Lock Lease second (Business child)
        await leaseModel.findByIdForUpdate(invoice.lease_id, conn);
      }

      // [HARDENED] 2. Atomic Idempotency Check (Within protected row lock)
      const existingPayment = await paymentModel.findByReferenceNumber(
        referenceNumber,
        conn
      );
      let paymentId;

      if (existingPayment) {
        // 3. Idempotency: If already verified, return successful result
        if (existingPayment.status === 'verified') {
          console.log(
            `[PaymentService] Idempotent trigger: Payment for ref ${referenceNumber} already verified. Skipping duplicate.`
          );
          if (!isExternalConn) await conn.rollback();
          return Number(existingPayment.id);
        }

        // [FIX] RECOVERY LOGIC: If a previously REJECTED or PENDING payment is confirmed by the gateway,
        // we update the existing record to 'verified' instead of trying to create a new one.
        logger.info(
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

      // [SECURITY FIX] True Tampering Guard: Reject zero-value or negative amounts.
      const expectedCents = Number(invoice.amount);
      if (Number(amount) <= 0) {
        throw new Error(
          'Invalid payment amount. Gateway sent a zero or negative value — possible tampering.'
        );
      }
      const isUnderpayment = Number(amount) < expectedCents;
      if (isUnderpayment) {
        // 4. Security Check: Handle discrepancy between paid amount vs expected
        logger.warn(
          `[Security Alert] Gateway underpayment for Invoice #${invoiceId}. Expected: ${expectedCents}, Received: ${amount}. Recording and flagging.`
        );
        if (data.guaranteeFullSettlement) {
          throw new Error(
            'Payment amount mismatch from a strict-settlement gateway. Security verification failed.'
          );
        }
      }

      if (!paymentId) {
        // 5. Create New Verified Payment record
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
            // Concurrent request catch-all
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

      // [NEW] 6. Reload Invoice with Lock AFTER trigger has fired (to get updated amount_paid)
      const freshInvoice = await invoiceModel.findByIdForUpdate(
        invoiceId,
        conn
      );

      // 7. Finalize actions (ledger, receipt, activation, notifications)
      const systemUser = { id: null, role: 'system' };
      const setupToken = await this._finalizeVerifiedPayment(
        paymentId,
        freshInvoice || invoice,
        payment,
        systemUser,
        conn
      );

      // [NEW] 8. Notify Treasurer of gateway underpayment for manual follow-up
      if (isUnderpayment) {
        const treasurers = await userModel.findByRole(ROLES.TREASURER, conn);
        for (const t of treasurers) {
          if (t.status === 'active') {
            await notificationModel.create(
              {
                userId: t.id,
                message: `Gateway Underpayment Alert: Invoice #${invoiceId} received ${fromCents(Number(amount)).toFixed(2)} but expected ${fromCents(expectedCents).toFixed(2)}. Shortfall: ${fromCents(expectedCents - Number(amount)).toFixed(2)}. Please follow up with tenant.`,
                type: 'payment',
                severity: 'urgent',
                entityType: 'payment',
                entityId: paymentId,
              },
              conn
            );
          }
        }
      }

      if (!isExternalConn) {
        await conn.commit();
      } else {
        await conn.query('RELEASE SAVEPOINT record_automated_payment');
      }

      // 9. Fire-and-forget emails (Tenant confirmation)
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
        await this._handleCommunicationFailure(
          invoiceId,
          invoice.tenantId || invoice.tenant_id,
          emailErr,
          'Payment Confirmation',
          conn
        );
      }
      return { paymentId, setupToken };
    } catch (error) {
      if (!isExternalConn) {
        await conn.rollback();
      } else {
        await conn.query('ROLLBACK TO SAVEPOINT record_automated_payment');
      }
      logger.error('[PaymentService] Automated Payment Failed:', {
        error: error.message,
      });
      throw error;
    } finally {
      if (!isExternalConn) conn.release();
    }
  }

  // VERIFY PAYMENT: Manual review by a Treasurer. Confirms if the money actually hit the bank account.
  async verifyPayment(
    paymentId,
    status,
    user,
    reason = null,
    connection = null
  ) {
    // 1. Authorization: Only Staff with Treasurer/Owner permissions allowed
    if (!authorizationService.isAtLeast(user.role, ROLES.TREASURER)) {
      throw new Error(
        'Access denied. Only Treasurers (or Owners) can verify payments.'
      );
    }

    const conn = connection || (await pool.getConnection());
    const isOwnTransaction = !connection;
    let connReleased = false;
    try {
      if (isOwnTransaction) await conn.beginTransaction();

      // 2. Fetch resources and lock rows for mutation
      const payment = await paymentModel.findById(paymentId, conn);
      if (!payment) throw new Error('Payment not found');

      const invoice = await invoiceModel.findById(
        payment.invoiceId || payment.invoice_id,
        conn
      );
      if (!invoice) throw new Error('Invoice not found');

      // [SECURITY FIX] 3. Integrity Check: Block verification for voided/cancelled invoices
      if (invoice.status === 'void' || invoice.status === 'cancelled') {
        throw new Error(
          'Cannot verify payment for a voided or cancelled invoice.'
        );
      }

      // [SECURITY] 4. Access Control: Cross-verify treasurer assignment to the property
      const lease = await leaseModel.findById(
        invoice.leaseId || invoice.lease_id,
        conn
      );
      if (!lease) throw new Error('Lease not found');

      const unit = await unitModel.findById(
        lease.unitId || lease.unit_id,
        conn
      );

      if (user.role === ROLES.OWNER) {
        // 4a. Owner check: Must own the property
        const property = await propertyModel.findById(
          unit.propertyId || unit.property_id,
          conn
        );
        if (
          !property ||
          String(property.ownerId || property.owner_id) !==
            String(user.id || user.user_id)
        ) {
          throw new Error('Access denied. You do not own this property.');
        }
      } else {
        // 4b. Treasurer check: Must be assigned to this specific property
        const assignedProperties = await staffModel.getAssignedProperties(
          user.id || user.user_id,
          conn
        );
        if (
          !assignedProperties.some(
            (p) => String(p.id) === String(unit.propertyId || unit.property_id)
          )
        ) {
          throw new Error(
            'Access denied. You are not assigned to this property.'
          );
        }
      }

      // 5. Update Status with Race-Condition protection
      const { payment: updatedPayment, changed } =
        await paymentModel.updateStatus(paymentId, status, null, conn);

      // [RACE CONDITION FIX] Concurrent catch
      if (!changed) {
        if (isOwnTransaction) await conn.rollback();
        throw new Error(
          'This payment was already verified or rejected by another user.'
        );
      }

      // 6. Branch Logic: Handle Verification vs Rejection
      if (status === 'verified') {
        const payment = updatedPayment;
        if (payment) {
          // [NEW] 6a. Reload Invoice with Lock AFTER trigger fired
          const freshInvoice = await invoiceModel.findByIdForUpdate(
            payment.invoiceId || payment.invoice_id,
            conn
          );

          // 6b. Run post-verification automation
          await this._finalizeVerifiedPayment(
            paymentId,
            freshInvoice || invoice,
            payment,
            user,
            conn
          );
        }
      } else if (status === 'rejected') {
        const payment = updatedPayment;
        if (payment) {
          // 7a. Revert invoice status based on remaining verified funds
          const allPayments = await paymentModel.findByInvoiceId(
            payment.invoiceId,
            conn
          );
          const totalVerified = allPayments
            .filter((p) => p.status === 'verified')
            .reduce((sum, p) => moneyMath(sum).add(p.amount).value(), 0);

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

          // 7b. Business Rule: Handle security deposit failure impact on reservation
          if (invoice.invoice_type === 'deposit') {
            await leaseModel.update(
              invoice.lease_id,
              {
                deposit_status: 'pending',
              },
              conn
            );

            // [FIX] Release unit reservation if NO verified funds remain
            if (totalVerified === 0) {
              const activeCount = await leaseModel.countActiveByUnitId(
                unit.id,
                conn
              );
              if (activeCount === 0) {
                await unitModel.update(unit.id, { status: 'available' }, conn);

                // [CRON] Collapse the expiry window to allow cleanup
                await leaseModel.update(
                  invoice.leaseId,
                  { reservationExpiresAt: { sql: 'NOW()' } },
                  conn
                );
              }
            }
          }

          // 7c. Notify Tenant of rejection
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

          // 7d. [AUDIT] Log rejection for historical records
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

      if (isOwnTransaction) {
        await conn.commit();
        conn.release();
        connReleased = true;
      }

      // 8. Communication Side Effects: Send Confirmation or Rejection emails
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
          await this._handleCommunicationFailure(
            updatedPayment.invoiceId,
            invoice.tenantId || invoice.tenant_id,
            emailErr,
            'Payment Confirmation',
            null
          );
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
          await this._handleCommunicationFailure(
            updatedPayment.invoiceId,
            invoice.tenantId || invoice.tenant_id,
            emailErr,
            'Payment Rejection',
            null
          );
        }
      }

      return updatedPayment;
    } catch (error) {
      if (isOwnTransaction && !connReleased) await conn.rollback();
      console.error('Verify Payment Transaction Failed:', error);
      throw error;
    } finally {
      if (isOwnTransaction && !connReleased) conn.release();
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
    // 1. Calculate financial variables from atomic state
    const invAmount = Number(invoice.amount);
    const totalPaidAfter = Number(
      invoice.amountPaid || invoice.amount_paid || 0
    );
    const thisPaymentAmount = Number(payment.amount);

    // [FINANCIAL] Calculate overpayment using atomic snapshots
    const currentSurplus = Math.max(0, totalPaidAfter - invAmount);
    const previousSurplus = Math.max(
      0,
      totalPaidAfter - thisPaymentAmount - invAmount
    );
    const incrementalOverpayment = Math.max(
      0,
      currentSurplus - previousSurplus
    );

    // 2. [FINANCIAL] Update Invoice Payment Status based on new total
    if (totalPaidAfter >= invAmount) {
      await invoiceModel.updateStatus(payment.invoiceId, 'paid', connection);
    } else if (totalPaidAfter > 0) {
      await invoiceModel.updateStatus(
        payment.invoiceId,
        'partially_paid',
        connection
      );
    }

    // 3. [FINANCIAL] Handle Credit Balance (Overpayment) for future use
    if (incrementalOverpayment > 0) {
      await tenantModel.addCredit(
        invoice.tenantId,
        incrementalOverpayment,
        connection,
        'overpayment',
        paymentId
      );
    }

    // 4. [FINANCIAL] Generate Receipt & Post Ledger Entry
    await receiptService.generateReceipt(
      { id: paymentId, amount: payment.amount },
      invoice,
      connection
    );

    await ledgerService.postPayment(
      paymentId,
      invoice,
      payment.amount,
      `Payment verified for ${invoice.description || invoice.invoiceType}`,
      connection
    );

    // 5. [OPERATIONAL] Trigger State Changes (Lease state, Auto-activation)
    const setupToken = await paymentOperationalService.handleDepositPayment(
      invoice,
      { ...payment, status: 'verified' },
      user,
      connection
    );

    // 6. [SIDE EFFECT] Secondary actions (Notifications, Scoring, Audit)
    await paymentSideEffectService.handleVerifiedPaymentEffects(
      paymentId,
      invoice,
      { ...payment, incrementalOverpayment },
      user,
      connection
    );

    return setupToken;
  }

  // GET PAYMENTS: Fetches payment history tailored to the user's role.
  async getPayments(user) {
    // Branch logic based on RBAC
    if (user.role === ROLES.TENANT) {
      return await paymentModel.findByTenantId(user.id);
    } else if (user.role === ROLES.TREASURER) {
      return await paymentModel.findByTreasurerId(user.id);
    } else if (user.role === ROLES.OWNER) {
      return await paymentModel.findByOwnerId(user.id);
    } else {
      throw new Error('Access denied');
    }
  }

  /**
   * Automatically applies any existing credit balance from the tenant's record
   * to a specific invoice. Reduces the "Balance Due" by creating a 'credit_applied' payment.
   */
  // APPLY TENANT CREDIT: Automatically settles an invoice using the tenant's existing credit balance.
  async applyTenantCredit(invoiceId, connection = null) {
    const db = connection || pool;
    const isExternalConn = !!connection;
    const conn = isExternalConn ? connection : await pool.getConnection();

    try {
      if (!isExternalConn) await conn.beginTransaction();

      // 1. Fetch Invoice details for validation
      const invoice = await invoiceModel.findById(invoiceId, conn);
      if (!invoice) throw new Error(`Invoice #${invoiceId} not found`);
      if (invoice.status === 'paid') {
        if (!isExternalConn) await conn.rollback();
        return null;
      }

      // 2. [FINANCIAL] Fetch Tenant Credit Balance
      const tenant = await tenantModel.findByUserId(invoice.tenantId, conn);
      if (!tenant || tenant.creditBalance <= 0) {
        if (!isExternalConn) await conn.rollback();
        return null;
      }

      // 3. Calculate "Balance Due" to determine how much credit to consume
      const allPayments = await paymentModel.findByInvoiceId(invoiceId, conn);
      const totalVerified = allPayments
        .filter((p) => p.status === 'verified')
        .reduce((sum, p) => moneyMath(sum).add(p.amount).value(), 0);

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

      // 4. Create Verified 'credit_applied' Payment record
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

      // 5. Atomic Deduction from tenant's account balance
      await tenantModel.deductCredit(
        invoice.tenantId,
        amountToApply,
        conn,
        'invoice_payment',
        invoiceId
      );

      // 6. Update Invoice Status based on new total
      const newTotalVerified = moneyMath(totalVerified)
        .add(amountToApply)
        .value();
      if (newTotalVerified >= invoice.amount) {
        await invoiceModel.updateStatus(invoiceId, 'paid', conn);
      } else {
        await invoiceModel.updateStatus(invoiceId, 'partially_paid', conn);
      }

      // 7. [AUDIT] Generate Receipt & Post Ledger Entry
      await receiptService.generateReceipt(
        { id: payId, amount: amountToApply },
        invoice,
        conn
      );

      await ledgerService.postPayment(
        payId,
        invoice,
        amountToApply,
        `Auto-applied credit from tenant balance to invoice #${invoiceId}`,
        conn
      );

      // 8. Notify Tenant of the automatic settlement
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
      return { paymentId: payId, amountApplied: amountToApply };
    } catch (error) {
      if (!isExternalConn) await conn.rollback();
      logger.error(
        `[PaymentService] Failed to apply tenant credit to Invoice #${invoiceId}:`,
        { error: error.message }
      );
      throw error;
    } finally {
      if (!isExternalConn) conn.release();
    }
  }

  /**
   * [NEW] Resolves Actionable Silent Failures.
   * Converts a background communication error into a prioritized staff alert.
   */
  // HANDLE COMMUNICATION FAILURE: Converts a background email failure into a prioritized staff alert.
  async _handleCommunicationFailure(
    invoiceId,
    tenantId,
    error,
    emailType,
    connection = null
  ) {
    const conn = connection || (await pool.getConnection());
    const isOwnConn = !connection;

    try {
      logger.error(
        `[Communication Failure] ${emailType} for Invoice #${invoiceId}:`,
        { error: error.message }
      );

      // 1. [AUDIT] Log failure for staff visibility in Recent Activity
      await auditLogger.log(
        {
          userId: null, // System action
          actionType: 'COMMUNICATION_FAILURE',
          entityId: invoiceId,
          entityType: 'invoice',
          details: {
            emailType,
            tenantId,
            errorMessage: error.message,
            severity: 'warning',
          },
        },
        { user: { role: 'system' } },
        conn
      );

      // 2. Identify and notify assigned Treasurers/Owners of the failure
      const [staff] = await conn.query(
        `SELECT DISTINCT user_id FROM staff_property_assignments spa
         JOIN units u ON spa.property_id = u.property_id
         JOIN leases l ON u.unit_id = l.unit_id
         JOIN rent_invoices ri ON l.lease_id = ri.lease_id
         WHERE ri.invoice_id = ?`,
        [invoiceId]
      );

      const alertMessage = `URGENT: ${emailType} failed for Invoice #${invoiceId}. Please verify tenant contact info and resend manually. (Error: ${error.message})`;

      for (const s of staff) {
        await notificationModel.create(
          {
            userId: s.user_id,
            message: alertMessage,
            type: 'system',
            severity: 'urgent',
            entityType: 'invoice',
            entityId: invoiceId,
          },
          conn
        );
      }
    } catch (handlerErr) {
      logger.error('[Critical] Failed to handle communication failure:', {
        error: handlerErr.message,
      });
    } finally {
      if (isOwnConn) conn.release();
    }
  }
}

export default new PaymentService();
