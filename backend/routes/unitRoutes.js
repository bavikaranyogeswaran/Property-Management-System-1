import { Router } from 'express';
import unitController from '../controllers/unitController.js';
import {
  authenticateToken,
  authorizeRoles,
  authorizeResource,
} from '../middleware/authMiddleware.js';

const router = Router();

// Public read access? Or authenticated? Assuming public for browsing.
router.get('/', unitController.getUnits);
router.get('/:id', unitController.getUnitById);

// Owner only
router.post(
  '/',
  authenticateToken,
  authorizeRoles('owner'),
  unitController.createUnit
);
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('owner'),
  authorizeResource('unit', 'id', 'params'),
  unitController.updateUnit
);
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('owner'),
  authorizeResource('unit', 'id', 'params'),
  unitController.deleteUnit
);

// Mark a maintenance unit as available (owner or treasurer)
router.patch(
  '/:id/mark-available',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  authorizeResource('unit', 'id', 'params'),
  unitController.markAvailable
);

router.patch(
  '/:id/clear-turnover',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  unitController.clearTurnover
);

export default router;
