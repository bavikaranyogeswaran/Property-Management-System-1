import { Router } from 'express';
import userController from '../controllers/userController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

// Treasurer creation (Owner only)
router.post('/create-treasurer', authenticateToken, userController.createTreasurer);

// Update own profile (Specific route must come before generic /:id)
router.put('/profile', authenticateToken, userController.updateProfile);

// Treasurer update (Owner only)
router.put('/:id', authenticateToken, userController.updateTreasurer);

// Treasurer deletion (Owner only)
router.delete('/:id', authenticateToken, userController.deleteTreasurer);

// Get all treasurers (Owner only)
router.get('/treasurers', authenticateToken, userController.getTreasurers);

// Get all tenants (Owner only)
router.get('/tenants', authenticateToken, userController.getTenants);

// Get user by ID (Generic)
router.get('/:id', authenticateToken, userController.getUserById);

// Property Assignments
router.post('/assign-property', authenticateToken, userController.assignProperty);
router.delete('/:userId/assign-property/:propertyId', authenticateToken, userController.removeProperty);
router.get('/:userId/assigned-properties', authenticateToken, userController.getAssignedProperties);



export default router;
