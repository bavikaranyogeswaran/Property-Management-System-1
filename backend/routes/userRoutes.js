import { Router } from 'express';
import userController from '../controllers/userController.js';
import authenticateToken, { authorizeRoles } from '../middleware/authMiddleware.js';
import validateRequest from '../middleware/validateRequest.js';
import {
  createTreasurerSchema,
  updateTreasurerSchema,
  updateProfileSchema,
} from '../schemas/userSchemas.js';

const router = Router();

// Treasurer creation (Owner only)
router.post(
  '/create-treasurer',
  authenticateToken,
  authorizeRoles('owner'),
  validateRequest(createTreasurerSchema),
  userController.createTreasurer
);

// Update own profile (Specific route must come before generic /:id)
router.get('/profile', authenticateToken, userController.getProfile);
router.put(
  '/profile',
  authenticateToken,
  validateRequest(updateProfileSchema),
  userController.updateProfile
);

// Treasurer update (Owner only)
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('owner'),
  validateRequest(updateTreasurerSchema),
  userController.updateTreasurer
);

// Treasurer deletion (Owner only)
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('owner'),
  userController.deleteTreasurer
);

// Get all treasurers (Owner only)
router.get(
  '/treasurers',
  authenticateToken,
  authorizeRoles('owner'),
  userController.getTreasurers
);

// Get all tenants (Owner only)
router.get('/tenants', authenticateToken, userController.getTenants);

// Get user by ID (Generic)
router.get('/:id', authenticateToken, userController.getUserById);

// Property Assignments
router.post(
  '/assign-property',
  authenticateToken,
  userController.assignProperty
);
router.delete(
  '/:userId/assign-property/:propertyId',
  authenticateToken,
  userController.removeProperty
);
router.get(
  '/:userId/assigned-properties',
  authenticateToken,
  userController.getAssignedProperties
);

export default router;
