import { Router } from 'express';
import guestPaymentController from '../controllers/guestPaymentController.js';
import upload from '../middleware/upload.js';
import {
  guestApiLimiter,
  guestSubmitLimiter,
} from '../middleware/guestLimiter.js';

const router = Router();

// [S6 FIX] Defense-in-depth: Prevent magic token leakage via Referer headers.
// The magic token already provides CSRF-equivalent protection (unguessable URL),
// but setting Referrer-Policy ensures the token doesn't leak to third-party
// analytics or ad scripts embedded on referral pages.
router.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Apply general rate limiting to all guest payment routes
router.use(guestApiLimiter);

// GET /api/public/invoice/:token
router.get('/:token', guestPaymentController.getInvoiceDetails);

// POST /api/public/invoice/:token/submit
router.post(
  '/:token/submit',
  guestSubmitLimiter,
  upload.single('proof'),
  guestPaymentController.submitPayment
);

// GET /api/public/invoice/:token/status (Polling for successful activation)
router.get('/:token/status', guestPaymentController.getActivationStatus);

// GET /api/public/invoice/:token/onboarding-status (Comprehensive Funnel Status)
router.get('/:token/onboarding-status', guestPaymentController.getStatus);

// GET /api/public/invoice/checkout-status/:orderId (Polling using PayHere Order ID)
router.get(
  '/checkout-status/:orderId',
  guestPaymentController.getActivationStatusByOrder
);

export default router;
