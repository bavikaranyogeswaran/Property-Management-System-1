import { Router } from 'express';
import receiptController from '../controllers/receiptController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, receiptController.getReceipts);

export default router;
