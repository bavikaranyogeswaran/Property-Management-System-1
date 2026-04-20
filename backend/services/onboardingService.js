import invoiceModel from '../models/invoiceModel.js';
import leaseModel from '../models/leaseModel.js';
import unitLockService from '../services/unitLockService.js';
import jwt from 'jsonwebtoken';
import AppError from '../utils/AppError.js';
import { ROLES } from '../utils/roleUtils.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

class OnboardingService {
  /**
   * Validates a magic token and returns invoice details.
   * Also acquires a unit lock to prevent concurrent reservations.
   */
  // GET INVOICE: Resolves a public magic link into a secure payment context.
  async getInvoiceByToken(token) {
    // 1. [SECURITY] Identify record via opaque magic token
    const invoice = await invoiceModel.findByMagicToken(token);
    if (!invoice) throw new AppError('Invalid or expired payment link.', 404);
    if (invoice.status === 'paid')
      throw new AppError('This invoice has already been paid.', 400);

    // 2. [CONCURRENCY] Acquire Unit Lock (Cart Locking): Prevents "Double-Booking" while user is on the checkout page.
    const lockAcquired = await unitLockService.acquireLock(
      invoice.unitId,
      invoice.tenantId
    );
    if (!lockAcquired)
      throw new AppError(
        'Another user is currently completing their reservation for this unit. Please try again in 15 minutes.',
        409
      );

    // 3. Return sanitized public view (Hide sensitive meta-data)
    return {
      id: invoice.id,
      amount: invoice.amount,
      type: invoice.invoiceType,
      propertyName: invoice.propertyName,
      unitNumber: invoice.unitNumber,
      description: invoice.description,
      status: invoice.status,
      unitId: invoice.unitId,
      tenantId: invoice.tenantId,
    };
  }

  /**
   * Checks activation status of a lease via magic token.
   * Generates a password setup token if both payment and lease are ready.
   */
  // GET ACTIVATION STATUS: Polls for the crossover point where Payment is Verified and Lease is Active.
  async getActivationStatus(token) {
    const invoice = await invoiceModel.findByMagicToken(token);
    if (!invoice) throw new AppError('Invalid or expired token.', 404);
    return this._checkActivation(invoice);
  }

  /**
   * Checks activation status via Order ID (PayHere).
   */
  // STATUS BY ORDER: PayHere callback handler to verify activation state via external reference.
  async getActivationStatusByOrder(orderId) {
    const invoice = await invoiceModel.findByOrderId(orderId);
    if (!invoice) throw new AppError('Order not found.', 404);
    return this._checkActivation(invoice);
  }

  /**
   * Returns a comprehensive status for the tenant onboarding tracker.
   */
  // TRACKER STATUS: Hydrates the Tenant Onboarding Dashboard with multi-model status info.
  async getTrackerStatus(token) {
    // 1. Resolve Invoice and Lease identity
    const invoice = await invoiceModel.findByMagicToken(token);
    if (!invoice)
      throw new AppError('Invalid or expired onboarding link.', 404);

    const lease = await leaseModel.findById(invoice.leaseId);
    if (!lease) throw new AppError('Lease not found.', 404);

    // 2. Map comprehensive status for the frontend tracker
    return {
      invoice: {
        id: invoice.id,
        amount: invoice.amount,
        status: invoice.status,
        type: invoice.invoiceType,
        description: invoice.description,
      },
      lease: {
        id: lease.id,
        status: lease.status,
        verification: {
          isVerified: lease.isDocumentsVerified,
          status: lease.verificationStatus,
          reason: lease.verificationRejectionReason,
          documentUrl: lease.documentUrl,
        },
      },
      property: { name: invoice.propertyName, unitNumber: invoice.unitNumber },
    };
  }

  /**
   * Internal helper to aggregate status and generate tokens.
   */
  // CHECK ACTIVATION: Internal gatekeeper that issues the final Account Setup Token once financial/legal bars are cleared.
  async _checkActivation(invoice) {
    // 1. Resolve core statuses
    const isPaid = invoice.status === 'paid';
    const lease = await leaseModel.findById(invoice.leaseId);
    if (!lease) throw new AppError('Lease not found.', 404);

    const isActive = lease.status === 'active';
    let setupToken = null;

    // 2. [SECURITY] Success Condition: If both paid and active, issue the 1-hour "Setup Password" JWT
    if (isPaid && isActive) {
      setupToken = jwt.sign(
        {
          id: Number(lease.tenantId),
          type: 'setup_password',
          role: ROLES.TENANT,
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
    }

    return {
      paid: isPaid,
      active: isActive,
      type: invoice.invoiceType,
      setupToken: setupToken,
    };
  }
}

export default new OnboardingService();
