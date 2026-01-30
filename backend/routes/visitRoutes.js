
import { Router } from 'express';
import visitController from '../controllers/visitController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

// Public route for scheduling
router.post('/', visitController.scheduleVisit);

// Protected route for owners to view visits
// Only authenticated users (owners/staff) should see the list
router.get('/', authenticateToken, visitController.getVisits);

// Update visit status
router.patch('/:id/status', authenticateToken, visitController.updateStatus);

export default router;
