import { Router } from 'express';
import leaseController from '../controllers/leaseController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, leaseController.getLeases);
router.get('/:id', authenticateToken, leaseController.getLeaseById);

export default router;
