import { Router } from 'express';
import propertyController from '../controllers/propertyController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

// Types (Public or Authenticated? Authenticated seems safer)
router.get('/types', authenticateToken, propertyController.getPropertyTypes);

// CRUD
router.get('/', authenticateToken, propertyController.getProperties);
router.post('/', authenticateToken, propertyController.createProperty);
router.get('/:id', authenticateToken, propertyController.getPropertyById);
router.put('/:id', authenticateToken, propertyController.updateProperty);
router.delete('/:id', authenticateToken, propertyController.deleteProperty);

export default router;
