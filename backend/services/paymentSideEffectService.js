import notificationModel from '../models/notificationModel.js';
import behaviorLogModel from '../models/behaviorLogModel.js';
import tenantModel from '../models/tenantModel.js';
import { fromCents } from '../utils/moneyUtils.js';
import {
  parseLocalDate,
  today,
  formatToLocalDate,
} from '../utils/dateUtils.js';
import auditLogger from '../utils/auditLogger.js';
import emailService from '../utils/emailService.js';
import userModel from '../models/userModel.js';

class PaymentSideEffectService {
  /**
   * Orchestrates the execution of non-critical side effects.
   * Ensures that a failure in notifications or scoring does not roll back the financial transaction.
   */
  async handleVerifiedPaymentEffects(
    paymentId,
    invoice,
    payment,
    user,
    connection
  ) {
    // 1. Audit Logging (Critical for tracking, but we catch locally to prevent rollback)
    await this._safelyExecute('Audit Logging', async () => {
      await auditLogger.log(
        {
          userId: user?.user_id || user?.id || null,
          actionType: 'PAYMENT_VERIFIED',
          entityId: paymentId,
          entityType: 'payment',
          details: {
            invoiceId: payment.invoiceId,
            amount: payment.amount,
            automated: user?.role === 'system',
          },
        },
        null,
        connection
      );
    });

    // 2. Notifications (Tenant)
    await this._safelyExecute('Tenant Notification', async () => {
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
    });

    // 3. Behavior Scoring
    await this._safelyExecute('Behavior Scoring', async () => {
      const paymentDate = parseLocalDate(payment.paymentDate || today());
      const dueDate = parseLocalDate(invoice.dueDate);
      if (formatToLocalDate(paymentDate) <= formatToLocalDate(dueDate)) {
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
    });

    // 4. Overpayment Notifications
    const incrementalOverpayment = payment.incrementalOverpayment || 0;
    if (incrementalOverpayment > 0) {
      await this._safelyExecute('Overpayment Notification', async () => {
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
      });
    }

    // 5. Fire-and-Forget Emails (Outside transaction)
    // Note: This matches the existing behavior of sending confirmation emails
    this._sendConfirmationEmail(invoice, payment);
  }

  /**
   * Standard error handler for silent side-effect failures.
   */
  async _safelyExecute(label, fn) {
    try {
      await fn();
    } catch (err) {
      console.error(
        `[PaymentSideEffectService] Non-critical failure in ${label}:`,
        err.message
      );
      // We do NOT re-throw. We want the main transaction to complete.
    }
  }

  async _sendConfirmationEmail(invoice, payment) {
    try {
      const tenant = await userModel.findById(
        invoice.tenantId || invoice.tenant_id
      );
      if (tenant?.email) {
        await emailService.sendPaymentConfirmation(tenant.email, {
          amount: payment.amount,
          paymentMethod: payment.paymentMethod || 'online',
          referenceNumber: payment.referenceNumber,
          invoiceId: payment.invoiceId,
        });
      }
    } catch (emailErr) {
      console.warn(
        '[PaymentSideEffectService] Email confirmation failed (silently):',
        emailErr.message
      );
    }
  }
}

export default new PaymentSideEffectService();
