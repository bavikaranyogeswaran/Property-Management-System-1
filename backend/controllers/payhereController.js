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

    const checkoutData = await payhereService.prepareCheckout(invoiceId);
    res.status(200).json({
      status: 'success',
      data: checkoutData,
    });
  });

  // PREPARE PUBLIC CHECKOUT: Packages the bill info for guests using a secure token.
  preparePublicCheckout = catchAsync(async (req, res) => {
    const { token } = req.params;
    if (!token) throw new Error('Token is required');

    // [NEW] Verify Lock before generating PayHere session
    const invoice = await invoiceModel.findByMagicToken(token);
    if (!invoice) throw new Error('Invalid or expired payment link.');

    const lockAcquired = await unitLockService.acquireLock(
      invoice.unitId,
      invoice.tenantId
    );

    if (!lockAcquired) {
      return res.status(409).json({
        status: 'error',
        message:
          'Another user is currently completing their reservation for this unit. Please try again in 15 minutes.',
      });
    }

    const checkoutData = await payhereService.prepareCheckout(null, token);
    res.status(200).json({
      status: 'success',
      data: checkoutData,
    });
  });

  // HANDLE NOTIFICATION: The webhook endpoint where PayHere says "Payment Success".
  handleNotification = catchAsync(async (req, res) => {
    const payload = req.body;
    const result = await payhereService.processNotification(payload);
    res.status(200).send('OK');
  });

  // SIMULATE WEBHOOK: For testing only. Pretends PayHere sent a success message.
  simulateWebhook = catchAsync(async (req, res) => {
    // [HARDENED] 1. Environment Guard: Disable simulation in production unless explicitly enabled
    const SIM_ENABLED =
      process.env.ENABLE_PAYMENT_SIMULATION === 'true' ||
      process.env.VITE_ENABLE_PAYMENT_SIMULATION === 'true';

    if (process.env.NODE_ENV === 'production' && !SIM_ENABLED) {
      console.warn(
        '[PayHereController] Simulation Attempt Denied. Simulations are disabled in production.'
      );
      return res.status(403).json({
        status: 'error',
        message: 'Simulation is disabled in this environment.',
      });
    }

    const { order_id, status_code, amount, payment_id, magic_token } = req.body;

    if (!order_id) throw new Error('Order ID is required for simulation');

    // Parse Invoice ID from Format: INV-ID-TIMESTAMP
    const parts = order_id.split('-');
    const invoiceId = Number(parts[1]);
    if (isNaN(invoiceId)) throw new Error('Invalid Order ID format');

    // [HARDENED] 2. Flexible Authorization Strategy
    let authorized = false;
    const user = req.user;

    // A. Staff Authorization (Always allowed in non-prod or if SIM_ENABLED)
    if (user && (user.role === 'owner' || user.role === 'treasurer')) {
      authorized = true;
    }

    // B. Magic Token Authorization (Guests/Leads)
    if (!authorized && magic_token) {
      const invoice = await invoiceModel.findByMagicToken(magic_token);
      if (
        invoice &&
        (Number(invoice.id) === invoiceId ||
          Number(invoice.invoice_id) === invoiceId)
      ) {
        authorized = true;
      }
    }

    // C. Tenant Authorization
    if (!authorized && user && user.role === 'tenant') {
      const invoice = await invoiceModel.findById(invoiceId);
      if (
        invoice &&
        (Number(invoice.tenantId) === user.id ||
          Number(invoice.tenant_id) === user.id)
      ) {
        authorized = true;
      }
    }

    if (!authorized) {
      console.error(
        `[PayHereController] Simulation Authorization Failed: Actor ${user?.id || 'Guest'} (${user?.role || 'None'}) for Invoice #${invoiceId}`
      );
      return res.status(403).json({
        status: 'error',
        message:
          'Access denied: You are not authorized to simulate this payment.',
      });
    }

    // 3. Verify Invoice Existence
    const invoice = await invoiceModel.findById(invoiceId);
    if (!invoice) {
      console.error(
        `[PayHereController] Simulation Failed: Invoice #${invoiceId} not found.`
      );
      return res.status(404).json({
        status: 'error',
        message: 'Invoice not found.',
      });
    }

    // Construct mock payload that bypasses hash check via the internal skipHash parameter
    const mockPayload = {
      merchant_id: process.env.PAYHERE_MERCHANT_ID,
      order_id,
      payhere_amount: amount,
      payhere_currency: 'LKR',
      status_code: status_code || '2', // Default to success
      payment_id: payment_id || `SIM-${Date.now()}`,
    };

    console.log(
      `[PayHereController] AUTHORIZED SIMULATION: Actor ${user?.id || 'Guest'} (${user?.role || 'Guest'}) triggered for Order ID: ${order_id}`
    );
    const result = await payhereService.processNotification(mockPayload, true); // skipHash = true
    console.log(
      `[PayHereController] Simulation complete. setupToken: ${result.setupToken ? 'present' : 'absent'}`
    );

    res.status(200).json({
      status: 'success',
      message: 'Simulation recorded successfully',
      setupToken: result.setupToken,
      result,
    });
  });
}

export default new PayHereController();
