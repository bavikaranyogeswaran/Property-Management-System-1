import { Router } from 'express';
import userController from '../controllers/userController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';
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
  authorizeRoles(ROLES.OWNER),
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

// Property Assignments
router.post(
  '/assign-property',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  userController.assignProperty
);

// Get all treasurers (Owner only)
router.get(
  '/treasurers',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  userController.getTreasurers
);

// Get all tenants (Owner and Treasurer)
router.get(
  '/tenants',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  userController.getTenants
);

// Get all owners (Owner and Treasurer)
router.get(
  '/owners',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  userController.getOwners
);

// --- GENERIC PARAMETER ROUTES (MUST BE AT THE BOTTOM) ---

// Get user by ID (Generic)
router.get('/:id(\\d+)', authenticateToken, userController.getUserById);

// Treasurer update (Owner only)
router.put(
  '/:id(\\d+)',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  validateRequest(updateTreasurerSchema),
  userController.updateTreasurer
);

// Treasurer deletion (Owner only)
router.delete(
  '/:id(\\d+)',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  userController.deleteTreasurer
);

// Security: Force Logout / Session Revocation
router.post(
  '/:id(\\d+)/force-logout',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  userController.forceLogout
);

// Resend invitation email (Owner only) — for users who haven't set up yet
router.post(
  '/:id(\\d+)/resend-invitation',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  userController.resendInvitation
);

router.delete(
  '/:userId(\\d+)/assign-property/:propertyId(\\d+)',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  userController.removeProperty
);

router.get(
  '/:userId(\\d+)/assigned-properties',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  userController.getAssignedProperties
);

export default router;
