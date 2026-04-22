import stripeService from '../services/stripeService.js';
import catchAsync from '../utils/catchAsync.js';
import invoiceModel from '../models/invoiceModel.js';
import unitLockService from '../services/unitLockService.js';

class StripeController {
  // CREATE CHECKOUT SESSION: Entry point for logged-in tenants
  createCheckoutSession = catchAsync(async (req, res) => {
    const { invoiceId } = req.body;
    if (!invoiceId) throw new Error('Invoice ID is required');

    const checkoutUrl = await stripeService.createCheckoutSession(invoiceId);

    res.status(200).json({
      status: 'success',
      data: { url: checkoutUrl },
    });
  });

  // CREATE PUBLIC CHECKOUT SESSION: Entry point for guests via magic tokens
  createPublicCheckoutSession = catchAsync(async (req, res) => {
    const { token } = req.params;
    if (!token) throw new Error('Token is required');

    // 1. Resolve invoice from token
    const invoice = await invoiceModel.findByMagicToken(token);
    if (!invoice) throw new Error('Invalid or expired payment link.');

    // 2. [CONCURRENCY] Acquire Unit Lock (Prevent double-booking)
    const lockAcquired = await unitLockService.acquireLock(
      invoice.unitId,
      invoice.tenantId
    );
    if (!lockAcquired) {
      return res.status(409).json({
        status: 'error',
        message:
          'Another user is currently completing their reservation for this unit. Please try again later.',
      });
    }

    // 3. Create Session
    const checkoutUrl = await stripeService.createCheckoutSession(null, token);

    res.status(200).json({
      status: 'success',
      data: { url: checkoutUrl },
    });
  });

  // HANDLE WEBHOOK: Secure receiver for Stripe events
  handleWebhook = catchAsync(async (req, res) => {
    const signature = req.headers['stripe-signature'];

    // Note: rawBody is required for signature verification.
    // We assume the server.js is configured to provide req.body as a Buffer for this route.
    const result = await stripeService.handleWebhook(req.body, signature);

    res.status(200).json(result);
  });
}

export default new StripeController();
