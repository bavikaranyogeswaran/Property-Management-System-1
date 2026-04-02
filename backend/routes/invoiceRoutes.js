import { Router } from 'express';
import invoiceController from '../controllers/invoiceController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeResource } from '../middleware/resourceAuthMiddleware.js';

const router = Router();

router.get('/', authenticateToken, invoiceController.getInvoices);
router.post('/', authenticateToken, invoiceController.createInvoice); // Manual trigger
router.post(
  '/generate',
  authenticateToken,
  invoiceController.generateMonthlyInvoices
); // Bulk generation
router.patch('/:id/status', authenticateToken, authorizeResource('invoice'), invoiceController.updateStatus);

export default router;
