import { Router } from 'express';
import maintenanceCostController from '../controllers/maintenanceCostController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';

import validateRequest from '../middleware/validateRequest.js';
import { addMaintenanceCostSchema } from '../schemas/maintenanceCostSchemas.js';

const router = Router();

router.post(
  '/',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  validateRequest(addMaintenanceCostSchema),
  maintenanceCostController.addCost
);
router.get(
  '/',
  authenticateToken,
  authorizeRoles('owner', 'treasurer', 'tenant'),
  maintenanceCostController.getCosts
);
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  maintenanceCostController.deleteCost
);

export default router;
