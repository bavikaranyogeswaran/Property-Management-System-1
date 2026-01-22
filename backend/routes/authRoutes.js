import { Router } from 'express';
const router = Router();
import authController from '../controllers/authController';
import authenticateToken from '../middleware/authMiddleware';

router.post('/login', authController.login);
router.post('/register-owner', authController.registerOwner);
router.post('/create-treasurer', authenticateToken, authController.createTreasurer);

export default router;
