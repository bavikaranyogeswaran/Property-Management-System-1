import { Router } from 'express';
import unitTypeController from '../controllers/unitTypeController.js';
import authenticateToken, {
  authorizeRoles,
} from '../middleware/authMiddleware.js';

const router = Router();

// Public GET - anyone can view unit types
router.get('/', unitTypeController.getAllUnitTypes);
router.get('/:id', unitTypeController.getUnitTypeById);

// Protected routes - Owner only
router.post(
  '/',
  authenticateToken,
  authorizeRoles('owner'),
  unitTypeController.createUnitType
);
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('owner'),
  unitTypeController.updateUnitType
);
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('owner'),
  unitTypeController.deleteUnitType
);

export default router;
