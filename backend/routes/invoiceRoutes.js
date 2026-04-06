import { Router } from 'express';
import invoiceController from '../controllers/invoiceController.js';
import {
  authenticateToken,
  authorizeResource,
} from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, invoiceController.getInvoices);
router.post('/', authenticateToken, invoiceController.createInvoice); // Manual trigger
router.post(
  '/generate',
  authenticateToken,
  invoiceController.generateMonthlyInvoices
); // Bulk generation
router.patch(
  '/:id/status',
  authenticateToken,
  authorizeResource('invoice', 'id', 'params'),
  invoiceController.updateStatus
);

export default router;
