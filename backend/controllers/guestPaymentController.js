import invoiceModel from '../models/invoiceModel.js';
import paymentService from '../services/paymentService.js';
import leaseModel from '../models/leaseModel.js';
import unitLockService from '../services/unitLockService.js';
import jwt from 'jsonwebtoken';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

class GuestPaymentController {
  getInvoiceDetails = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const invoice = await invoiceModel.findByMagicToken(token);

    if (!invoice) {
      return next(new AppError('Invalid or expired payment link.', 404));
    }

    if (invoice.status === 'paid') {
      return next(new AppError('This invoice has already been paid.', 400));
    }

    // [NEW] Acquire Unit Lock (Cart Locking)
    // We use the tenantId (User ID) as the lock owner.
    const lockAcquired = await unitLockService.acquireLock(
      invoice.unitId,
      invoice.tenantId
    );

    if (!lockAcquired) {
      const lockInfo = await unitLockService.isLocked(
        invoice.unitId,
        invoice.tenantId
      );
      return next(
        new AppError(
          `Another user is currently completing their reservation for this unit. Please try again in 15 minutes.`,
          409
        )
      );
    }

    // Return only safe public information
    res.json({
      id: invoice.id,
      amount: invoice.amount,
      type: invoice.invoiceType,
      propertyName: invoice.propertyName,
      unitNumber: invoice.unitNumber,
      description: invoice.description,
      status: invoice.status,
    });
  });

  submitPayment = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const file = req.file; // From multer

    const paymentId = await paymentService.submitGuestPayment(
      req.body,
      token,
      file
    );

    res.status(201).json({
      message:
        'Payment evidence submitted successfully. Our team will verify it shortly.',
      paymentId,
    });
  });

  /**
   * For polling: Checks if the payment was successful and the lease is active.
   * If so, returns an onboarding token for the tenant.
   */
  getActivationStatus = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const invoice = await invoiceModel.findByMagicToken(token);

    if (!invoice) {
      return next(new AppError('Invalid or expired token.', 404));
    }

    // Check if invoice is paid
    const isPaid = invoice.status === 'paid';

    // Check associated lease status
    const lease = await leaseModel.findById(invoice.leaseId);
    if (!lease) {
      return next(new AppError('Lease not found.', 404));
    }
    const isActive = lease && lease.status === 'active';

    let setupToken = null;
    if (isPaid && isActive) {
      // Generate a standard onboarding token
      setupToken = jwt.sign(
        {
          id: Number(lease.tenantId),
          type: 'setup_password',
          role: 'tenant',
        },
        JWT_SECRET,
        { expiresIn: '1h' } // Short-lived for this specific redirect
      );
    }

    res.json({
      paid: isPaid,
      active: isActive,
      type: invoice.invoiceType,
      setupToken: setupToken,
    });
  });

  /**
   * For polling: Checks status using the PayHere order_id.
   * Securely verifies that the order_id matches the invoice before returning status.
   */
  getActivationStatusByOrder = catchAsync(async (req, res, next) => {
    const { orderId } = req.params;
    const invoice = await invoiceModel.findByOrderId(orderId);

    if (!invoice) {
      return next(new AppError('Order not found.', 404));
    }

    // Reuse the same verification logic as the token-based check
    const isPaid = invoice.status === 'paid';
    const lease = await leaseModel.findById(invoice.leaseId);
    if (!lease) {
      return next(new AppError('Lease not found.', 404));
    }
    const isActive = lease && lease.status === 'active';

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

    res.json({
      paid: isPaid,
      active: isActive,
      type: invoice.invoiceType,
      setupToken: setupToken,
    });
  });

  /**
   * Comprehensive Onboarding Status for the Status Tracker.
   * Returns invoice, lease, and verification status for a given magic token.
   */
  getStatus = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const invoice = await invoiceModel.findByMagicToken(token);

    if (!invoice) {
      return next(new AppError('Invalid or expired onboarding link.', 404));
    }

    // Fetch the full lease to get verification details
    const lease = await leaseModel.findById(invoice.leaseId);
    if (!lease) {
      return next(new AppError('Lease not found.', 404));
    }

    res.json({
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
          status: lease.verificationStatus, // pending, verified, rejected
          reason: lease.verificationRejectionReason,
          documentUrl: lease.documentUrl,
        },
      },
      property: {
        name: invoice.propertyName,
        unitNumber: invoice.unitNumber,
      },
    });
  });
}

export default new GuestPaymentController();
