import { Router } from 'express';
import userController from '../controllers/userController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

// Treasurer creation (Owner only)
router.post('/create-treasurer', authenticateToken, userController.createTreasurer);

// Treasurer update (Owner only)
router.put('/:id', authenticateToken, userController.updateTreasurer);

// Treasurer deletion (Owner only)
router.delete('/:id', authenticateToken, userController.deleteTreasurer);

export default router;
