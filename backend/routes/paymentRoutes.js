import { Router } from 'express';
import paymentController from '../controllers/paymentController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

router.post('/', authenticateToken, paymentController.submitPayment);
router.get('/', authenticateToken, paymentController.getPayments);
router.put('/:id/verify', authenticateToken, paymentController.verifyPayment);

export default router;
