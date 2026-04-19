// ============================================================================
//  GUEST PAYMENT CONTROLLER (The Public Cashier)
// ============================================================================
//  This file allows prospects to pay their security deposits BEFORE they have
//  an official tenant account. It uses secure, one-time-use links.
// ============================================================================

import onboardingService from '../services/onboardingService.js';
import paymentService from '../services/paymentService.js';
import catchAsync from '../utils/catchAsync.js';

class GuestPaymentController {
  // GET INVOICE DETAILS: Safely surfaces bill info for an unauthenticated user using a token.
  getInvoiceDetails = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const details = await onboardingService.getInvoiceByToken(token);
    res.json(details);
  });

  // SUBMIT PAYMENT: Allows a guest to upload their bank transfer slip.
  submitPayment = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const file = req.file;

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

  getActivationStatus = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const status = await onboardingService.getActivationStatus(token);
    res.json(status);
  });

  getActivationStatusByOrder = catchAsync(async (req, res, next) => {
    const { orderId } = req.params;
    const status = await onboardingService.getActivationStatusByOrder(orderId);
    res.json(status);
  });

  getStatus = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const status = await onboardingService.getTrackerStatus(token);
    res.json(status);
  });
}

export default new GuestPaymentController();
