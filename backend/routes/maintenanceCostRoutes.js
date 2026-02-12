import { Router } from 'express';
import maintenanceCostController from '../controllers/maintenanceCostController.js';
import authenticateToken from '../middleware/authMiddleware.js';

import validateRequest from '../middleware/validateRequest.js';
import { addMaintenanceCostSchema } from '../schemas/maintenanceCostSchemas.js';

const router = Router();

router.post(
  '/',
  authenticateToken,
  validateRequest(addMaintenanceCostSchema),
  maintenanceCostController.addCost
);
router.get('/', authenticateToken, maintenanceCostController.getCosts);
router.delete('/:id', authenticateToken, maintenanceCostController.deleteCost);

export default router;
