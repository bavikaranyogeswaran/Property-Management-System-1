import { Router } from 'express';
import unitController from '../controllers/unitController.js';
import {
  authenticateToken,
  authorizeRoles,
  authorizeResource,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

const router = Router();

// Public read access? Or authenticated? Assuming public for browsing.
router.get('/', unitController.getUnits);
router.get('/:id', unitController.getUnitById);

// Owner only
router.post(
  '/',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  unitController.createUnit
);
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  authorizeResource('unit', 'id', 'params'),
  unitController.updateUnit
);
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  authorizeResource('unit', 'id', 'params'),
  unitController.deleteUnit
);

// Mark a maintenance unit as available (owner or treasurer)
router.patch(
  '/:id/mark-available',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  authorizeResource('unit', 'id', 'params'),
  unitController.markAvailable
);

router.patch(
  '/:id/clear-turnover',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  unitController.clearTurnover
);

export default router;
