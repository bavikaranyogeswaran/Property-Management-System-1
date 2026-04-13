import pool from '../config/db.js';
import paymentModel from '../models/paymentModel.js';
import invoiceModel from '../models/invoiceModel.js';
import tenantModel from '../models/tenantModel.js';
import leaseModel from '../models/leaseModel.js';
import { today, parseLocalDate, moneyMath } from '../utils/dateUtils.js';
import { fromCents, toCentsFromMajor } from '../utils/moneyUtils.js';
import unitModel from '../models/unitModel.js';
import leadModel from '../models/leadModel.js';
import ledgerService from './ledgerService.js';
import receiptService from './receiptService.js';
import paymentSideEffectService from './paymentSideEffectService.js';
import paymentOperationalService from './paymentOperationalService.js';
import { ROLES } from '../utils/roleUtils.js';

// Restored for un-refactored methods
import notificationModel from '../models/notificationModel.js';
import auditLogger from '../utils/auditLogger.js';
import userModel from '../models/userModel.js';

/**
 * Maps an invoice_type to the correct accounting ledger classification.
 */
// [REMOVED] getLedgerClassification is now encapsulated within LedgerService.js

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
      const invoice = await invoiceModel.findById(invoiceId, connection);

      if (!invoice) throw new Error('Invoice not found');
      if (invoice.leaseId && invoice.status === 'paid') {
        throw new Error('This invoice has already been paid.');
      }

      // Authorization
      const lease = await leaseModel.findById(invoice.leaseId, connection);
      if (!lease || String(lease.tenantId) !== String(tenantId)) {
        throw new Error('Access denied. This invoice does not belong to you.');
      }

      // Concurrency Control: One pending payment at a time
      const pendingPayments = await paymentModel.findByInvoiceId(
        invoiceId,
        connection
      );
      if (pendingPayments.some((p) => p.status === 'pending')) {
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
      const invoicePending = await paymentModel.findByInvoiceId(
        invoiceId,
        connection
      );
      if (invoicePending.some((p) => p.status === 'pending')) {
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
      // [NEW] Release Redis Lock unconditionally after checkout completes (success or fail)
      // The database state now reflects the pending payment, so the "soft lock" is no longer needed.
      try {
        if (magicToken) {
          // We must query fresh or safely, without connection as it might be released soon, or before release
          // Actually, we can just use the provided parameters if we hoisted invoice, but we didn't. Let's fetch invoice briefly if needed.
          const invoice = await invoiceModel.findByMagicToken(magicToken, pool); // grab a quick query from pool
          if (invoice && invoice.unitId) {
            const leadId = await leadModel.findIdByEmailAndProperty(
              invoice.tenant_email || invoice.email,
              invoice.propertyId || invoice.property_id || invoice.unitId // rough fallback
            );
            const unitLockService = (await import('./unitLockService.js'))
              .default;
            await unitLockService.releaseLock(invoice.unitId, leadId);
          }
        }
      } catch (lockErr) {
        console.error(
          '[PaymentService] Failed to release Redis lock:',
          lockErr
        );
      }
      connection.release();
    }
  }

  // [REMOVED] _postToLedger is now encapsulated within LedgerService.js

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

      // [SECURITY FIX] True Tampering Guard: Reject zero-value or negative amounts only.
      // Legitimate underpayments from the gateway are recorded and flagged for Treasurer review unless guaranteeFullSettlement is strict.
      const expectedCents = Number(invoice.amount);
      if (Number(amount) <= 0) {
        throw new Error(
          'Invalid payment amount. Gateway sent a zero or negative value — possible tampering.'
        );
      }
      const isUnderpayment = Number(amount) < expectedCents;
      if (isUnderpayment) {
        console.warn(
          `[Security Alert] Gateway underpayment for Invoice #${invoiceId}. Expected: ${expectedCents}, Received: ${amount}. Recording and flagging.`
        );
        if (data.guaranteeFullSettlement) {
          throw new Error(
            'Payment amount mismatch from a strict-settlement gateway. Security verification failed.'
          );
        }
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

      // [NEW] Reload Invoice with Lock AFTER trigger has fired (to get updated amount_paid)
      const freshInvoice = await invoiceModel.findByIdForUpdate(
        invoiceId,
        conn
      );

      // 2. Finalize actions (ledger, receipt, activation, notifications)
      // Use a dummy system user for automated actions
      const systemUser = { id: null, role: 'system' };
      await this._finalizeVerifiedPayment(
        paymentId,
        freshInvoice || invoice, // Fallback to stale if something went critically wrong
        payment,
        systemUser,
        conn
      );

      // [NEW] Notify Treasurer of gateway underpayment
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
        await this._handleCommunicationFailure(
          invoiceId,
          invoice.tenantId || invoice.tenant_id,
          emailErr,
          'Payment Confirmation',
          conn
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
          // [NEW] Reload Invoice with Lock AFTER trigger has fired (to get updated amount_paid)
          const freshInvoice = await invoiceModel.findByIdForUpdate(
            payment.invoiceId || payment.invoice_id,
            conn
          );

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
              const activeCount = await leaseModel.countActiveByUnitId(
                unit.id,
                conn
              );
              if (activeCount === 0) {
                await unitModel.update(unit.id, { status: 'available' }, conn);

                // Collapse the expiry window to allow cron cleanup
                await leaseModel.update(
                  invoice.leaseId,
                  { reservationExpiresAt: { sql: 'NOW()' } },
                  conn
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
          await this._handleCommunicationFailure(
            updatedPayment.invoiceId,
            invoice.tenantId || invoice.tenant_id,
            emailErr,
            'Payment Confirmation',
            conn
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
            conn
          );
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
   *  async _finalizeVerifiedPayment(
    paymentId,
    invoice,
    payment,
    user,
    connection
  ) {
    const invAmount = Number(invoice.amount);
    const totalPaidAfter = Number(
      invoice.amountPaid || invoice.amount_paid || 0
    );
    const thisPaymentAmount = Number(payment.amount);

    // 1. [CRITICAL] Calculate overpayment using atomic snapshots
    const currentSurplus = Math.max(0, totalPaidAfter - invAmount);
    const previousSurplus = Math.max(
      0,
      totalPaidAfter - thisPaymentAmount - invAmount
    );
    const incrementalOverpayment = Math.max(0, currentSurplus - previousSurplus);

    // 2. [CRITICAL] Update Invoice Payment Status
    if (totalPaidAfter >= invAmount) {
      await invoiceModel.updateStatus(payment.invoiceId, 'paid', connection);
    } else if (totalPaidAfter > 0) {
      await invoiceModel.updateStatus(
        payment.invoiceId,
        'partially_paid',
        connection
      );
    }

    // 3. [CRITICAL] Handle Credit Balance (Overpayment)
    if (incrementalOverpayment > 0) {
      await tenantModel.addCredit(
        invoice.tenantId,
        incrementalOverpayment,
        connection,
        'overpayment',
        paymentId
      );
    }

    // 4. [FINANCIAL] Generate Receipt & Post Ledger
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

    // 5. [OPERATIONAL] Operational Side Effects (Lease state, Auto-activation)
    // Delegated to Operational Service to keep this transaction lean.
    await paymentOperationalService.handleDepositPayment(
      invoice,
      { ...payment, status: 'verified' },
      user,
      connection
    );

    // 6. [NON-CRITICAL] Secondary Side Effects (Notifications, Scoring, Audit)
    // Delegated to SideEffect Service which ensures resilience (try/catch internal).
    await paymentSideEffectService.handleVerifiedPaymentEffects(
      paymentId,
      invoice,
      { ...payment, incrementalOverpayment },
      user,
      connection
    );
  }

  async getPayments(user) {
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
      const newTotalVerified = moneyMath(totalVerified)
        .add(amountToApply)
        .value();
      if (newTotalVerified >= invoice.amount) {
        await invoiceModel.updateStatus(invoiceId, 'paid', conn);
      } else {
        await invoiceModel.updateStatus(invoiceId, 'partially_paid', conn);
      }

      // 7. Generate Receipt
      await receiptService.generateReceipt(
        { id: payId, amount: amountToApply },
        invoice,
        conn
      );

      // 8. Post Ledger Entry (Delegated to LedgerService)
      await ledgerService.postPayment(
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

  /**
   * [NEW] Resolves Actionable Silent Failures.
   * Converts a background communication error into a prioritized staff alert.
   */
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
      console.error(
        `[Communication Failure] ${emailType} for Invoice #${invoiceId}:`,
        error.message
      );

      // 1. Audit Log: Visible in Recent Activity
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

      // 2. Notify Assigned Treasurers/Owners
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
      console.error(
        '[Critical] Failed to handle communication failure:',
        handlerErr
      );
    } finally {
      if (isOwnConn) conn.release();
    }
  }
}

export default new PaymentService();
