import { Router } from 'express';
import paymentController from '../controllers/paymentController.js';

import authenticateToken from '../middleware/authMiddleware.js';
import validateRequest from '../middleware/validateRequest.js';
import {
    submitPaymentSchema,
    recordCashPaymentSchema,
    verifyPaymentSchema
} from '../schemas/paymentSchemas.js';

const router = Router();

router.post('/', authenticateToken, validateRequest(submitPaymentSchema), paymentController.submitPayment);
router.post('/cash', authenticateToken, validateRequest(recordCashPaymentSchema), paymentController.recordCashPayment);
router.get('/', authenticateToken, paymentController.getPayments);
router.put('/:id/verify', authenticateToken, validateRequest(verifyPaymentSchema), paymentController.verifyPayment);

export default router;
