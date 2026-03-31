import { Router } from 'express';
import guestPaymentController from '../controllers/guestPaymentController.js';
import upload from '../middleware/upload.js';

const router = Router();

// GET /api/public/invoice/:token
router.get('/:token', guestPaymentController.getInvoiceDetails);

// POST /api/public/invoice/:token/submit
router.post('/:token/submit', upload.single('proof'), guestPaymentController.submitPayment);

// GET /api/public/invoice/:token/status (Polling for successful activation)
router.get('/:token/status', guestPaymentController.getActivationStatus);

// GET /api/public/invoice/checkout-status/:orderId (Polling using PayHere Order ID)
router.get('/checkout-status/:orderId', guestPaymentController.getActivationStatusByOrder);

export default router;
