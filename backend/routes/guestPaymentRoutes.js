import { Router } from 'express';
import guestPaymentController from '../controllers/guestPaymentController.js';
import upload from '../middleware/upload.js';

const router = Router();

// GET /api/public/invoice/:token
router.get('/:token', guestPaymentController.getInvoiceDetails);

// POST /api/public/invoice/:token/submit
router.post('/:token/submit', upload.single('proof'), guestPaymentController.submitPayment);

export default router;
