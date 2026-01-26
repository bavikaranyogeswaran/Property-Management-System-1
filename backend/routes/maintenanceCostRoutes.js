import { Router } from 'express';
import maintenanceCostController from '../controllers/maintenanceCostController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

router.post('/', authenticateToken, maintenanceCostController.addCost);
router.get('/', authenticateToken, maintenanceCostController.getCosts);
router.delete('/:id', authenticateToken, maintenanceCostController.deleteCost);

export default router;
