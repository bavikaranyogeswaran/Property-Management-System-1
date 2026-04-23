import { Router } from 'express';
import invoiceController from '../controllers/invoiceController.js';
import {
  authenticateToken,
  authorizeResource,
  authorizeRoles,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

const router = Router();

router.get('/', authenticateToken, invoiceController.getInvoices);
router.post(
  '/',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  invoiceController.createInvoice
); // Manual trigger
router.post(
  '/generate',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  invoiceController.generateMonthlyInvoices
); // Bulk generation
router.patch(
  '/:id/status',
  authenticateToken,
  authorizeResource('invoice', 'id', 'params'),
  invoiceController.updateStatus
);
router.post(
  '/:id/correct',
  authenticateToken,
  authorizeResource('invoice', 'id', 'params'),
  invoiceController.correctInvoice
);

export default router;
