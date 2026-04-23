import { Router } from 'express';
import paymentController from '../controllers/paymentController.js';

import {
  authenticateToken,
  authorizeRoles,
  authorizeResource,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

import validateRequest from '../middleware/validateRequest.js';
import {
  submitPaymentSchema,
  verifyPaymentSchema,
} from '../schemas/paymentSchemas.js';
import idempotencyMiddleware from '../middleware/idempotencyMiddleware.js';

const router = Router();

import upload from '../middleware/upload.js';

router.post(
  '/',
  authenticateToken,
  // [S3 FIX] Only tenants can submit payments — prevents confusing errors for staff
  authorizeRoles(ROLES.TENANT),
  upload.single('proof'),
  idempotencyMiddleware(),
  validateRequest(submitPaymentSchema),
  paymentController.submitPayment
);

router.get('/', authenticateToken, paymentController.getPayments);
router.put(
  '/:id/verify',
  authenticateToken,
  // [S3 FIX] Replace hardcoded strings with ROLES constants
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  authorizeResource('payment', 'id', 'params'),
  validateRequest(verifyPaymentSchema),
  paymentController.verifyPayment
);

export default router;
