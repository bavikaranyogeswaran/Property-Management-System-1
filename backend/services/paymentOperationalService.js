import leaseModel from '../models/leaseModel.js';
import invoiceModel from '../models/invoiceModel.js';
import notificationModel from '../models/notificationModel.js';
import auditLogger from '../utils/auditLogger.js';
import { addDays, today, formatToLocalDate } from '../utils/dateUtils.js';

class PaymentOperationalService {
  /**
   * Handles operational updates linked to payments, specifically for deposit invoices.
   */
  // HANDLE DEPOSIT PAYMENT: Orchestrates the operational side-effects of receiving a security deposit.
  async handleDepositPayment(invoice, payment, user, connection) {
    const isDeposit =
      invoice.invoiceType === 'deposit' || invoice.invoice_type === 'deposit';
    if (!isDeposit) return;

    // 1. Resolve final payment state
    const finalInvoice = await invoiceModel.findById(
      payment.invoiceId,
      connection
    );
    const isFullyPaid = finalInvoice.status === 'paid';

    // 2. [SIDE EFFECT] Extend Reservation: Grant exactly 7 days from payment date to finalize remaining legal steps (Docs)
    const extendedExpiry = formatToLocalDate(addDays(today(), 7));
    await leaseModel.update(
      invoice.leaseId,
      {
        depositStatus: isFullyPaid ? 'paid' : 'pending',
        reservationExpiresAt: extendedExpiry,
      },
      connection
    );

    // 3. [AUDIT] Log the automated reservation extension
    await auditLogger.log(
      {
        userId: null,
        actionType: 'RESERVATION_EXTENDED',
        entityId: invoice.leaseId,
        entityType: 'lease',
        details: {
          newExpiry: extendedExpiry,
          reason: 'Deposit payment auto-extension',
        },
      },
      null,
      connection
    );

    // 4. Trigger Conversion: Attempt to convert 'draft' to 'active' if fully funded
    if (isFullyPaid)
      return await this._attemptAutoActivation(
        invoice.leaseId,
        user,
        connection
      );
    return null;
  }

  // ATTEMPT AUTO ACTIVATION: Conversion engine that checks for legal (Docs) and financial (Deposit) readiness.
  async _attemptAutoActivation(leaseId, user, connection) {
    const lease = await leaseModel.findById(leaseId, connection);
    if (!lease || lease.status !== 'draft') return null;

    // 1. [SIDE EFFECT] Onboarding: Trigger account creation flow regardless of documents (Scenario D support)
    const userService = (await import('./userService.js')).default;
    const setupToken = await userService.triggerOnboarding(
      lease.tenantId,
      connection
    );

    // 2. [SECURITY] Pre-activation Check: If documents ARE verified, attempt atomic lease signing
    if (lease.isDocumentsVerified) {
      try {
        const leaseService = (await import('./leaseService.js')).default;
        await leaseService.signLease(lease.id, user, connection);
      } catch (activationErr) {
        // 3. [SCENARIO FAIL] Unit blocked: Notify staff if unit status prevents activation
        await this._notifyStaffOfBlockedActivation(
          lease,
          'Unit Availability Conflict',
          connection
        );
      }
    } else {
      // 4. [SCENARIO FAIL] Legal blocked: Notify staff if documents are missing/pending
      await this._notifyStaffOfBlockedActivation(
        lease,
        'Documents Pending Verification',
        connection
      );
    }

    return setupToken;
  }

  // NOTIFY STAFF: Urgent notification engine for blocked conversions.
  async _notifyStaffOfBlockedActivation(lease, reason, connection) {
    // 1. Resolve notification audience (Owner + Assigned Staff)
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

    // 2. Dispatch urgent notifications to the dashboard hub
    const message = `URGENT: Deposit Paid for Lease #${lease.id}, but AUTO-ACTIVATION is BLOCKED. Reason: ${reason}.`;
    for (const userId of userIdsToNotify) {
      await notificationModel.create(
        {
          userId,
          message,
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
