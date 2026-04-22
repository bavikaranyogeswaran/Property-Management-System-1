import express from 'express';
import stripeController from '../controllers/stripeController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route   POST /api/stripe/checkout
 * @desc    Create a Stripe Checkout Session for an invoice (Tenant)
 */
router.post(
  '/checkout',
  authenticateToken,
  stripeController.createCheckoutSession
);

/**
 * @route   GET /api/stripe/checkout/public/:token
 * @desc    Create a Stripe Checkout Session via magic token (Guest)
 */
router.get(
  '/checkout/public/:token',
  stripeController.createPublicCheckoutSession
);

/**
 * @route   POST /api/stripe/webhook
 * @desc    Standard Stripe Webhook Endpoint
 * @note    This route must receive the raw body for signature verification.
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  stripeController.handleWebhook
);

export default router;
