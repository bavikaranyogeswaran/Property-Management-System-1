import { Router } from 'express';
import authController from '../controllers/authController.js';
import passwordController from '../controllers/passwordController.js';

const router = Router();

router.post('/login', authController.login);
router.post('/forgot-password', passwordController.forgotPassword);
router.post('/reset-password', passwordController.resetPassword);

export default router;
