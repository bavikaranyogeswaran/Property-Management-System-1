import payhereService from '../services/payhereService.js';
import catchAsync from '../utils/catchAsync.js';

/**
 * Handles PayHere checkout and notification.
 */
class PayHereController {
  /**
   * Prepares data for PayHere checkout (Authenticated).
   */
  prepareCheckout = catchAsync(async (req, res) => {
    const { invoiceId } = req.body;
    if (!invoiceId) throw new Error('Invoice ID is required');

    const checkoutData = await payhereService.prepareCheckout(invoiceId);
    res.status(200).json({
      status: 'success',
      data: checkoutData,
    });
  });

  /**
   * Prepares data for PayHere checkout using a Magic Token (Guest Payment).
   */
  preparePublicCheckout = catchAsync(async (req, res) => {
    const { token } = req.params;
    if (!token) throw new Error('Token is required');

    const checkoutData = await payhereService.prepareCheckout(null, token);
    res.status(200).json({
      status: 'success',
      data: checkoutData,
    });
  });

  /**
   * Handles PayHere notification (Webhook).
   */
  handleNotification = catchAsync(async (req, res) => {
    const payload = req.body;
    const result = await payhereService.processNotification(payload);
    res.status(200).send('OK');
  });

  /**
   * Simulates a PayHere webhook notification (Authorized).
   * This allows the system to process simulated payments without moving real money,
   * but prevents unauthorized users from activating arbitrary invoices.
   */
  simulateWebhook = catchAsync(async (req, res) => {
    // [HARDENED] 1. Environment Guard: Disable simulation in production
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ENABLE_PAYMENT_SIMULATION !== 'true'
    ) {
      console.warn(
        '[PayHereController] Simulation Attempt Denied. Simulations are disabled in production.'
      );
      return res.status(403).json({
        status: 'error',
        message: 'Simulation is disabled in this environment.',
      });
    }

    const { order_id, status_code, amount, payment_id } = req.body;

    if (!order_id) throw new Error('Order ID is required for simulation');

    // [HARDENED] 2. Strict RBAC Strategy: Only Staff (Treasurer/Owner) can trigger simulations
    // This prevents applicants or tenants from bypassing the gateway to self-authorize payments.
    const user = req.user;
    if (!user || (user.role !== 'owner' && user.role !== 'treasurer')) {
      console.error(
        `[PayHereController] Simulation Authorization Failed: Unauthorized actor role ${user?.role || 'Guest'}`
      );
      return res.status(403).json({
        status: 'error',
        message:
          'Access denied: Only Property Owners or Treasurers can simulate payments.',
      });
    }

    // Parse Invoice ID from Format: INV-ID-TIMESTAMP
    const parts = order_id.split('-');
    const invoiceId = Number(parts[1]);
    if (isNaN(invoiceId)) throw new Error('Invalid Order ID format');

    // Dynamic Loading to avoid circular dependencies
    const invoiceModel = (await import('../models/invoiceModel.js')).default;

    // 3. Verify Invoice Existence
    const invoice = await invoiceModel.findById(invoiceId);
    if (!invoice || Number(invoice.id || invoice.invoice_id) !== invoiceId) {
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
      `[PayHereController] STAFF-AUTHORIZED SIMULATION: Actor ${user.id} (${user.role}) trigged for Order ID: ${order_id}`
    );
    const result = await payhereService.processNotification(mockPayload, true); // skipHash = true

    res.status(200).json({
      status: 'success',
      message: 'Staff-authorized simulation recorded',
      result,
    });
  });
}

export default new PayHereController();
