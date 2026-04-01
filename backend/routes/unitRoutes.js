import { Router } from 'express';
import unitController from '../controllers/unitController.js';
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js';
import { authorizeResource } from '../middleware/resourceAuthMiddleware.js';

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
  authorizeResource('unit'),
  unitController.updateUnit
);
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('owner'),
  authorizeResource('unit'),
  unitController.deleteUnit
);

// Mark a maintenance unit as available (owner or treasurer)
router.patch(
  '/:id/mark-available',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  authorizeResource('unit'),
  unitController.markAvailable
);

export default router;
