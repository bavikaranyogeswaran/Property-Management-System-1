import { Router } from 'express';
import authController from '../controllers/authController.js';
import passwordController from '../controllers/passwordController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

router.post('/login', authController.login);
router.post('/verify-email', authController.verifyEmail);
router.post('/setup-password', authController.setupPassword);
router.post('/forgot-password', passwordController.forgotPassword);
router.post('/reset-password', passwordController.resetPassword);
router.post('/change-password', authenticateToken, passwordController.changePassword);

export default router;
