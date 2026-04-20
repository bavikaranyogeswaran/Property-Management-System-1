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

    // 1. [SECURITY] Token Validation: Resolve invoice and property details via opaque magic link
    const details = await onboardingService.getInvoiceByToken(token);

    res.json(details);
  });

  // SUBMIT PAYMENT: Allows a guest to upload their bank transfer slip.
  submitPayment = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const file = req.file;

    // 1. [DELEGATION] Evidence Submission: Record the transaction and attach the asset URL
    const paymentId = await paymentService.submitGuestPayment(
      req.body,
      token,
      file
    );

    // 2. [RESPONSE] Dispatch confirmation for UI success state
    res.status(201).json({
      message:
        'Payment evidence submitted successfully. Our team will verify it shortly.',
      paymentId,
    });
  });

  // GET ACTIVATION STATUS: Checks if the lease has been activated post-payment.
  getActivationStatus = catchAsync(async (req, res, next) => {
    const { token } = req.params;

    // 1. [DELEGATION] State Resolver: Check the current lifecycle stage of the draft lease
    const status = await onboardingService.getActivationStatus(token);

    res.json(status);
  });

  // GET STATUS BY ORDER: Payhere-specific status poller.
  getActivationStatusByOrder = catchAsync(async (req, res, next) => {
    const { orderId } = req.params;

    // 1. [FINANCIAL] Reconciliation: Check gateway status for a specific payment reference
    const status = await onboardingService.getActivationStatusByOrder(orderId);

    res.json(status);
  });

  // GET TRACKER STATUS: Comprehensive overview of the onboarding pipeline (Leads -> Lease).
  getStatus = catchAsync(async (req, res, next) => {
    const { token } = req.params;

    // 1. [DELEGATION] Pipeline Resolver: Hydrate the multi-stage progress DTO
    const status = await onboardingService.getTrackerStatus(token);

    res.json(status);
  });
}

export default new GuestPaymentController();
