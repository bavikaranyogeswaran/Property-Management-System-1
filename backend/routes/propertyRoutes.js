import { Router } from 'express';
import propertyController from '../controllers/propertyController.js';
import authenticateToken, { authorizeRoles } from '../middleware/authMiddleware.js';

const router = Router();

// Types (Authenticated)
router.get('/types', authenticateToken, propertyController.getPropertyTypes);

// CRUD
// GET / - Allow all authenticated users
router.get('/', authenticateToken, propertyController.getProperties);

// POST / - Owner only
router.post('/', authenticateToken, authorizeRoles('owner'), propertyController.createProperty);

// GET /:id - Allow all authenticated users
router.get('/:id', authenticateToken, propertyController.getPropertyById);

// PUT /:id - Owner only
router.put('/:id', authenticateToken, authorizeRoles('owner'), propertyController.updateProperty);

// DELETE /:id - Owner only
router.delete('/:id', authenticateToken, authorizeRoles('owner'), propertyController.deleteProperty);

export default router;
