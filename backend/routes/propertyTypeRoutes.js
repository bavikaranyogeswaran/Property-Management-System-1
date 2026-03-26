import { Router } from 'express';
import propertyTypeController from '../controllers/propertyTypeController.js';
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js';

const router = Router();

// Public GET
router.get('/', propertyTypeController.getAllPropertyTypes);
router.get('/:id', propertyTypeController.getPropertyTypeById);

// Protected Routes (Owner only)
router.post(
  '/',
  authenticateToken,
  authorizeRoles('owner'),
  propertyTypeController.createPropertyType
);
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('owner'),
  propertyTypeController.updatePropertyType
);
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('owner'),
  propertyTypeController.deletePropertyType
);

export default router;
