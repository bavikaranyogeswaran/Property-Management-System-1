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
}

export default new PayHereController();
