import payhereService from '../services/payhereService.js';
import catchAsync from '../utils/catchAsync.js';
import invoiceModel from '../models/invoiceModel.js';
import unitLockService from '../services/unitLockService.js';

// ============================================================================
//  PAYHERE CONTROLLER (The Payment Gateway)
// ============================================================================
//  Handles the hand-off to the Sri Lankan payment processor (PayHere).
//  It prepares the checkout sessions and securely receives webhook notifications.
// ============================================================================

class PayHereController {
  // PREPARE CHECKOUT: Packages the bill info so PayHere knows how much to charge (Logged-in users).
  prepareCheckout = catchAsync(async (req, res) => {
    const { invoiceId } = req.body;
    if (!invoiceId) throw new Error('Invoice ID is required');

    // 1. [DELEGATION] Packaging: Generate the cryptographically signed payload for the PayHere frontend SDK
    const checkoutData = await payhereService.prepareCheckout(invoiceId);

    res.status(200).json({ status: 'success', data: checkoutData });
  });

  // PREPARE PUBLIC CHECKOUT: Packages the bill info for guests using a secure token.
  preparePublicCheckout = catchAsync(async (req, res) => {
    const { token } = req.params;
    if (!token) throw new Error('Token is required');

    // 1. [VALIDATION] Resolve the invoice from the magic token
    const invoice = await invoiceModel.findByMagicToken(token);
    if (!invoice) throw new Error('Invalid or expired payment link.');

    // 2. [CONCURRENCY] Acquire Unit Lock: Claims the unit for 15 mins to prevent double-booking while paying
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

    // 3. [DELEGATION] Prepare Gateway Session
    const checkoutData = await payhereService.prepareCheckout(null, token);
    res.status(200).json({ status: 'success', data: checkoutData });
  });

  // HANDLE NOTIFICATION: The webhook endpoint where PayHere says "Payment Success".
  handleNotification = catchAsync(async (req, res) => {
    const payload = req.body;

    // 1. [DELEGATION] Webhook Processing: Verify MD5 signature and update invoice/lease status
    const result = await payhereService.processNotification(payload);

    res.status(200).send('OK');
  });

  // SIMULATE WEBHOOK: For testing only. Pretends PayHere sent a success message.
  simulateWebhook = catchAsync(async (req, res) => {
    // 1. [SECURITY] Environment Guard: Block entry in production unless explicitly enabled via secrets
    const SIM_ENABLED =
      process.env.ENABLE_PAYMENT_SIMULATION === 'true' ||
      process.env.VITE_ENABLE_PAYMENT_SIMULATION === 'true';

    if (process.env.NODE_ENV === 'production' && !SIM_ENABLED) {
      console.warn(
        '[PayHereController] Simulation Attempt Denied. Simulations are disabled in production.'
      );
      return res
        .status(403)
        .json({
          status: 'error',
          message: 'Simulation is disabled in this environment.',
        });
    }

    const { order_id, status_code, amount, payment_id, magic_token } = req.body;
    if (!order_id) throw new Error('Order ID is required for simulation');

    // 2. [TRANSFORMATION] Parse Invoice ID from Order ID string
    const parts = order_id.split('-');
    const invoiceId = Number(parts[1]);
    if (isNaN(invoiceId)) throw new Error('Invalid Order ID format');

    // 3. [SECURITY] Authorization Layer: Verify if 'Actor' belongs to this invoice thread
    let authorized = false;
    const user = req.user;

    if (user && (user.role === 'owner' || user.role === 'treasurer'))
      authorized = true;
    if (!authorized && magic_token) {
      const invoice = await invoiceModel.findByMagicToken(magic_token);
      if (
        invoice &&
        (Number(invoice.id) === invoiceId ||
          Number(invoice.invoice_id) === invoiceId)
      )
        authorized = true;
    }
    if (!authorized && user && user.role === 'tenant') {
      const invoice = await invoiceModel.findById(invoiceId);
      if (
        invoice &&
        (Number(invoice.tenantId) === user.id ||
          Number(invoice.tenant_id) === user.id)
      )
        authorized = true;
    }

    if (!authorized)
      return res
        .status(403)
        .json({
          status: 'error',
          message: 'Access denied: Unauthorized simulation.',
        });

    // 4. [DATA] Verification
    const invoice = await invoiceModel.findById(invoiceId);
    if (!invoice)
      return res
        .status(404)
        .json({ status: 'error', message: 'Invoice not found.' });

    // 5. [DELEGATION] Internal Dispatch: Route mock payload bypassing internal hash checks
    const mockPayload = {
      merchant_id: process.env.PAYHERE_MERCHANT_ID,
      order_id,
      payhere_amount: amount,
      payhere_currency: 'LKR',
      status_code: status_code || '2',
      payment_id: payment_id || `SIM-${Date.now()}`,
    };

    const result = await payhereService.processNotification(mockPayload, true); // skipHash = true

    res.status(200).json({
      status: 'success',
      message: 'Simulation recorded successfully',
      setupToken: result.setupToken,
      result,
    });
  });
}

export default new PayHereController();
