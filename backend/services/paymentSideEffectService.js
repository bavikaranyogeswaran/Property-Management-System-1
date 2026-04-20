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
  // HANDLE VERIFIED PAYMENT EFFECTS: Orchestrates non-critical business logic after a payment is secured.
  // Note: Wrapped in safe execution blocks to ensure high-priority financial transactions never roll back due to side-effect failures.
  async handleVerifiedPaymentEffects(
    paymentId,
    invoice,
    payment,
    user,
    connection
  ) {
    // 1. [AUDIT] Track Verification: Log the identity and payload of the verified payment
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

    // 2. [SIDE EFFECT] Tenant Hub: Push real-time notification to the tenant dashboard
    await this._safelyExecute('Tenant Notification', async () => {
      await notificationModel.create(
        {
          userId: invoice.tenantId || invoice.tenant_id,
          message: `Payment of ${fromCents(payment.amount).toFixed(2)} for Invoice #${payment.invoiceId} verified.`,
          type: 'payment',
          entityType: 'payment',
          entityId: paymentId,
        },
        connection
      );
    });

    // 3. [SIDE EFFECT] Behavior Scoring: Reward on-time payments with positive behavior points
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

    // 4. [SIDE EFFECT] Credit Management: Notify tenant about account balance increases (Overpayments)
    const incOverpayment = payment.incrementalOverpayment || 0;
    if (incOverpayment > 0) {
      await this._safelyExecute('Overpayment Notification', async () => {
        await notificationModel.create(
          {
            userId: invoice.tenantId,
            message: `Overpayment of ${fromCents(incOverpayment).toFixed(2)} credited to balance.`,
            type: 'payment',
            entityType: 'payment',
            entityId: paymentId,
          },
          connection
        );
      });
    }

    // 5. [SIDE EFFECT] External Comm: Dispatch fire-and-forget confirmation emails
    this._sendConfirmationEmail(invoice, payment);
  }

  // SAFE EXECUTE: Internal wrapper to trap errors and prevent main transaction interference.
  async _safelyExecute(label, fn) {
    try {
      await fn();
    } catch (err) {
      console.error(
        `[PaymentSideEffectService] Non-critical failure in ${label}:`,
        err.message
      );
    }
  }

  // SEND CONFIRMATION EMAIL: Resolves tenant identity and dispatches legal confirmation via SendGrid/Mailgun.
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
    } catch (err) {
      console.warn(
        '[PaymentSideEffectService] Email dispatch failed silenty:',
        err.message
      );
    }
  }
}

export default new PaymentSideEffectService();
