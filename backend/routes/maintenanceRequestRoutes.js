import { Router } from 'express';
import maintenanceRequestController from '../controllers/maintenanceRequestController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

router.post('/', authenticateToken, maintenanceRequestController.createRequest);
router.get('/', authenticateToken, maintenanceRequestController.getRequests);
router.put('/:id/status', authenticateToken, maintenanceRequestController.updateStatus);

export default router;
