import { Router } from 'express';
import rateLimit from 'express-rate-limit';
const router = Router();
import authController from '../controllers/authController.js';

import passwordController from '../controllers/passwordController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import validateRequest from '../middleware/validateRequest.js';
import { loginLimiter, sensitiveActionLimiter } from '../utils/rateLimiters.js';
import {
  loginSchema,
  verifyEmailSchema,
  setupPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../schemas/authSchemas.js';

// Note: local loginLimiter removed, replaced by import

import upload from '../middleware/upload.js';

router.post(
  '/login',
  loginLimiter,
  validateRequest(loginSchema),
  authController.login
);
router.post(
  '/verify-email',
  sensitiveActionLimiter,
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
  sensitiveActionLimiter,
  validateRequest(forgotPasswordSchema),
  passwordController.forgotPassword
);
router.post(
  '/reset-password',
  sensitiveActionLimiter,
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
