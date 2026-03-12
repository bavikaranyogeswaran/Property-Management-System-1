import { Router } from 'express';
import authController from '../controllers/authController.js';

import passwordController from '../controllers/passwordController.js';
import authenticateToken from '../middleware/authMiddleware.js';
import validateRequest from '../middleware/validateRequest.js';
import forgotPasswordLimiter from '../middleware/forgotPasswordLimiter.js';
import {
  loginSchema,
  verifyEmailSchema,
  setupPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../schemas/authSchemas.js';

const router = Router();

import upload from '../middleware/upload.js';

router.post('/login', validateRequest(loginSchema), authController.login);
router.post(
  '/verify-email',
  validateRequest(verifyEmailSchema),
  authController.verifyEmail
);
router.post(
  '/setup-password',
  upload.single('nicDoc'),
  (req, res, next) => {
    // Parse tenantData if it's sent as a string (FormData case)
    if (typeof req.body.tenantData === 'string') {
      try {
        req.body.tenantData = JSON.parse(req.body.tenantData);
      } catch (e) {
        console.error('Failed to parse tenantData JSON in middleware:', e);
      }
    }
    next();
  },
  validateRequest(setupPasswordSchema),
  authController.setupPassword
);
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validateRequest(forgotPasswordSchema),
  passwordController.forgotPassword
);
router.post(
  '/reset-password',
  validateRequest(resetPasswordSchema),
  passwordController.resetPassword
);
router.post(
  '/change-password',
  authenticateToken,
  validateRequest(changePasswordSchema),
  passwordController.changePassword
);

export default router;
