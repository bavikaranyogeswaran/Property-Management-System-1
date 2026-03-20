import { Router } from 'express';
import renewalController from '../controllers/renewalController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, renewalController.getRequests);
router.post('/:id/propose', authenticateToken, renewalController.proposeTerms);
router.post('/:id/approve', authenticateToken, renewalController.approveRenewal);
router.post('/:id/reject', authenticateToken, renewalController.rejectRenewal);

export default router;
