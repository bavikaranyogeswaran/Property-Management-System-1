import express from 'express';
import payoutController from '../controllers/payoutController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = express.Router();

// Preview Payout (Owner only)
router.get('/preview', authenticateToken, payoutController.previewPayout);

// Generate/Record Payout (Owner only)
router.post('/create', authenticateToken, payoutController.createPayout);

// Get Payout History (Owner only)
router.get('/history', authenticateToken, payoutController.getHistory);

export default router;
