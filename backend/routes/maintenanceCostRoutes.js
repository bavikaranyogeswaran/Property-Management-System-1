import { Router } from 'express';
import maintenanceCostController from '../controllers/maintenanceCostController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

import validateRequest from '../middleware/validateRequest.js';
import { addMaintenanceCostSchema } from '../schemas/maintenanceCostSchemas.js';

const router = Router();

router.post(
  '/',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  validateRequest(addMaintenanceCostSchema),
  maintenanceCostController.addCost
);
router.get(
  '/',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER, ROLES.TENANT),
  maintenanceCostController.getCosts
);
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  maintenanceCostController.deleteCost
);

export default router;
