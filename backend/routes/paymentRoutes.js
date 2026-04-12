import { Router } from 'express';
import paymentController from '../controllers/paymentController.js';

import {
  authenticateToken,
  authorizeRoles,
  authorizeResource,
} from '../middleware/authMiddleware.js';

import validateRequest from '../middleware/validateRequest.js';
import {
  submitPaymentSchema,
  verifyPaymentSchema,
} from '../schemas/paymentSchemas.js';

const router = Router();

import upload from '../middleware/upload.js';

router.post(
  '/',
  authenticateToken,
  upload.single('proof'),
  validateRequest(submitPaymentSchema),
  paymentController.submitPayment
);

router.get('/', authenticateToken, paymentController.getPayments);
router.put(
  '/:id/verify',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  authorizeResource('payment', 'id', 'params'),
  validateRequest(verifyPaymentSchema),
  paymentController.verifyPayment
);

export default router;
