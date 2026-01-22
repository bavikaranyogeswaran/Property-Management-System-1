import { Router } from 'express';
import userController from '../controllers/userController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

// Treasurer creation (Owner only)
router.post('/create-treasurer', authenticateToken, userController.createTreasurer);

export default router;
