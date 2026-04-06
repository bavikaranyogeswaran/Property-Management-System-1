import express from 'express';
import payoutController from '../controllers/payoutController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Preview Payout (Treasurer only - check in controller)
router.get('/preview', authenticateToken, payoutController.previewPayout);

// Generate/Record Payout (Treasurer only)
router.post('/create', authenticateToken, payoutController.createPayout);

// Get Payout History (Owner/Treasurer)
router.get('/history', authenticateToken, payoutController.getHistory);

// Mark Payout move to PAID (Treasurer only)
router.put('/:id/paid', authenticateToken, payoutController.markAsPaid);

// Owner Acknowledgment
router.put(
  '/:id/acknowledge',
  authenticateToken,
  payoutController.acknowledgePayout
);

// Owner Dispute
router.put('/:id/dispute', authenticateToken, payoutController.disputePayout);

// Get Payout Details (Owner/Treasurer)
router.get(
  '/:id/details',
  authenticateToken,
  payoutController.getPayoutDetails
);

// Export Payout CSV (Owner/Treasurer)
router.get('/:id/export', authenticateToken, payoutController.exportPayoutCSV);

export default router;
