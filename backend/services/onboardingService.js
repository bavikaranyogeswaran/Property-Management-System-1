import invoiceModel from '../models/invoiceModel.js';
import leaseModel from '../models/leaseModel.js';
import unitLockService from '../services/unitLockService.js';
import jwt from 'jsonwebtoken';
import AppError from '../utils/AppError.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

class OnboardingService {
  /**
   * Validates a magic token and returns invoice details.
   * Also acquires a unit lock to prevent concurrent reservations.
   */
  async getInvoiceByToken(token) {
    const invoice = await invoiceModel.findByMagicToken(token);

    if (!invoice) {
      throw new AppError('Invalid or expired payment link.', 404);
    }

    if (invoice.status === 'paid') {
      throw new AppError('This invoice has already been paid.', 400);
    }

    // Acquire Unit Lock (Cart Locking)
    const lockAcquired = await unitLockService.acquireLock(
      invoice.unitId,
      invoice.tenantId
    );

    if (!lockAcquired) {
      throw new AppError(
        'Another user is currently completing their reservation for this unit. Please try again in 15 minutes.',
        409
      );
    }

    // Return safe public information
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
  async getActivationStatus(token) {
    const invoice = await invoiceModel.findByMagicToken(token);
    if (!invoice) {
      throw new AppError('Invalid or expired token.', 404);
    }

    return this._checkActivation(invoice);
  }

  /**
   * Checks activation status via Order ID (PayHere).
   */
  async getActivationStatusByOrder(orderId) {
    const invoice = await invoiceModel.findByOrderId(orderId);
    if (!invoice) {
      throw new AppError('Order not found.', 404);
    }

    return this._checkActivation(invoice);
  }

  /**
   * Returns a comprehensive status for the tenant onboarding tracker.
   */
  async getTrackerStatus(token) {
    const invoice = await invoiceModel.findByMagicToken(token);
    if (!invoice) {
      throw new AppError('Invalid or expired onboarding link.', 404);
    }

    const lease = await leaseModel.findById(invoice.leaseId);
    if (!lease) {
      throw new AppError('Lease not found.', 404);
    }

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
      property: {
        name: invoice.propertyName,
        unitNumber: invoice.unitNumber,
      },
    };
  }

  /**
   * Internal helper to aggregate status and generate tokens.
   */
  async _checkActivation(invoice) {
    const isPaid = invoice.status === 'paid';
    const lease = await leaseModel.findById(invoice.leaseId);
    if (!lease) {
      throw new AppError('Lease not found.', 404);
    }

    const isActive = lease.status === 'active';
    let setupToken = null;

    if (isPaid && isActive) {
      setupToken = jwt.sign(
        {
          id: Number(lease.tenantId),
          type: 'setup_password',
          role: 'tenant',
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
