import { Router } from 'express';
import invoiceController from '../controllers/invoiceController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, invoiceController.getInvoices);
router.post('/', authenticateToken, invoiceController.createInvoice); // Manual trigger

export default router;
