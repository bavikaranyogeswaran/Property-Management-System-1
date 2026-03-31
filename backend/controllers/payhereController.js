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
            data: checkoutData
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
            data: checkoutData
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
     * Simulates a PayHere webhook notification for local development.
     */
    simulateWebhook = catchAsync(async (req, res) => {
        const { order_id, status_code, amount, payment_id } = req.body;
        
        if (!order_id) throw new Error('Order ID is required for simulation');

        // Construct mock payload that bypasses hash check via the 'is_simulation' flag
        const mockPayload = {
            merchant_id: process.env.PAYHERE_MERCHANT_ID,
            order_id,
            payhere_amount: amount,
            payhere_currency: 'LKR',
            status_code: status_code || '2', // Default to success
            payment_id: payment_id || `SIM-${Date.now()}`,
            is_simulation: true
        };

        console.log(`[PayHereController] Simulating webhook for Order ID: ${order_id}`);
        const result = await payhereService.processNotification(mockPayload);
        
        res.status(200).json({
            status: 'success',
            message: 'Simulation triggered',
            result
        });
    });
}


export default new PayHereController();
