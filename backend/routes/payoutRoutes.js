import express from 'express';
import payoutController from '../controllers/payoutController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';

const router = express.Router();

// Preview Payout (Treasurer only)
router.get(
  '/preview',
  authenticateToken,
  authorizeRoles('treasurer'),
  payoutController.previewPayout
);

// Generate/Record Payout (Treasurer only)
router.post(
  '/create',
  authenticateToken,
  authorizeRoles('treasurer'),
  payoutController.createPayout
);

// Get Payout History (Owner/Treasurer)
router.get(
  '/history',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  payoutController.getHistory
);

// Mark Payout move to PAID (Treasurer only)
router.put(
  '/:id/paid',
  authenticateToken,
  authorizeRoles('treasurer'),
  payoutController.markAsPaid
);

// Owner Acknowledgment
router.put(
  '/:id/acknowledge',
  authenticateToken,
  authorizeRoles('owner'),
  payoutController.acknowledgePayout
);

// Owner Dispute
router.put(
  '/:id/dispute',
  authenticateToken,
  authorizeRoles('owner'),
  payoutController.disputePayout
);

// Get Payout Details (Owner/Treasurer)
router.get(
  '/:id/details',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  payoutController.getPayoutDetails
);

// Export Payout CSV (Owner/Treasurer)
router.get(
  '/:id/export',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  payoutController.exportPayoutCSV
);

export default router;
