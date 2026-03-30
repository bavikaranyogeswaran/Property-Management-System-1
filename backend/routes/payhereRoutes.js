import express from 'express';
import payhereController from '../controllers/payhereController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route   POST /api/payhere/checkout
 * @desc    Prepare PayHere checkout data for an invoice
 * @access  Private (Tenant)
 */
router.post('/checkout', authenticateToken, payhereController.prepareCheckout);

/**
 * @route   GET /api/payhere/checkout/public/:token
 * @desc    Prepare PayHere checkout data using a magic token (Public)
 */
router.get('/checkout/public/:token', payhereController.preparePublicCheckout);

/**
 * @route   POST /api/payhere/notify
 * @desc    Receive payment notification from PayHere (Webhook)
 * @access  Public
 */
router.post('/notify', payhereController.handleNotification);

export default router;
