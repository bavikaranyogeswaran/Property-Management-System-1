import leaseModel from '../models/leaseModel.js';
import invoiceModel from '../models/invoiceModel.js';
import notificationModel from '../models/notificationModel.js';
import auditLogger from '../utils/auditLogger.js';
import { addDays, today, formatToLocalDate } from '../utils/dateUtils.js';

class PaymentOperationalService {
  /**
   * Handles operational updates linked to payments, specifically for deposit invoices.
   */
  async handleDepositPayment(invoice, payment, user, connection) {
    const isDeposit =
      invoice.invoiceType === 'deposit' || invoice.invoice_type === 'deposit';
    if (!isDeposit) return;

    // 1. Check final payment status of the invoice
    const finalInvoice = await invoiceModel.findById(
      payment.invoiceId,
      connection
    );
    const isFullyPaid = finalInvoice.status === 'paid';

    // 2. [HARDENED] Standardized Reservation Extension Logic
    // We extend the reservation to 7 days from TODAY (the payment date), not from lease creation.
    // This gives staff/tenant exactly 1 week to finalize document verification.
    const extendedExpiry = formatToLocalDate(addDays(today(), 7));

    await leaseModel.update(
      invoice.leaseId,
      {
        depositStatus: isFullyPaid ? 'paid' : 'pending',
        reservationExpiresAt: extendedExpiry,
      },
      connection
    );

    // 3. Log Reservation Extension
    await auditLogger.log(
      {
        userId: null,
        actionType: 'RESERVATION_EXTENDED',
        entityId: invoice.leaseId,
        entityType: 'lease',
        details: {
          newExpiry: extendedExpiry,
          reason: 'Deposit payment received (Auto-extension)',
        },
      },
      null,
      connection
    );

    // 4. Auto-Lease Activation
    if (isFullyPaid) {
      return await this._attemptAutoActivation(
        invoice.leaseId,
        user,
        connection
      );
    }
    return null;
  }

  /**
   * Attempts to activate a lease if all preconditions (Payment + Documents) are met.
   */
  async _attemptAutoActivation(leaseId, user, connection) {
    const lease = await leaseModel.findById(leaseId, connection);
    if (!lease || lease.status !== 'draft') return null;

    // [SCENARIO D FIX] Always trigger onboarding upon deposit payment, regardless of documents.
    // This generates the setupToken so the tenant can set their password immediately.
    const userService = (await import('./userService.js')).default;
    const setupToken = await userService.triggerOnboarding(
      lease.tenantId,
      connection
    );
    console.log(
      `[PaymentOperationalService] Onboarding result for Lease #${leaseId}: ${setupToken ? 'Token generated' : 'No token'}`
    );

    if (lease.isDocumentsVerified) {
      try {
        // [RESILIENCE] Dynamic imports to avoid circular dependencies
        const leaseService = (await import('./leaseService.js')).default;
        await leaseService.signLease(lease.id, user, connection);
      } catch (activationErr) {
        console.error(
          `[PaymentOperationalService] Auto-activation blocked for Lease #${leaseId}:`,
          activationErr.message
        );
        await this._notifyStaffOfBlockedActivation(
          lease,
          'Unit Status / Turnaround Error',
          connection
        );
      }
    } else {
      // Payment complete but documents are pending
      await this._notifyStaffOfBlockedActivation(
        lease,
        'Documents Pending Verification',
        connection
      );
    }

    return setupToken;
  }

  async _notifyStaffOfBlockedActivation(lease, reason, connection) {
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

    const message = `URGENT: Deposit Paid for Lease #${lease.id} (Unit ${lease.unitNumber}), but AUTO-ACTIVATION is BLOCKED. Reason: ${reason}. Manual check required.`;

    for (const userId of userIdsToNotify) {
      await notificationModel.create(
        {
          userId: userId,
          message: message,
          type: 'lease',
          severity: 'urgent',
          entityType: 'lease',
          entityId: lease.id,
        },
        connection
      );
    }
  }
}

export default new PaymentOperationalService();
