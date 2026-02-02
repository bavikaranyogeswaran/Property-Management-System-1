import { Router } from 'express';
import leaseController from '../controllers/leaseController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, leaseController.getLeases);
router.post('/', authenticateToken, leaseController.createLease);
router.get('/:id', authenticateToken, leaseController.getLeaseById);
router.put('/:id/renew', authenticateToken, leaseController.renewLease);

export default router;
