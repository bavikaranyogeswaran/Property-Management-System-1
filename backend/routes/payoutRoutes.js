import express from 'express';
import payoutController from '../controllers/payoutController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';
import idempotencyMiddleware from '../middleware/idempotencyMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

const router = express.Router();

// Preview Payout (Treasurer only)
router.get(
  '/preview',
  authenticateToken,
  authorizeRoles(ROLES.TREASURER),
  payoutController.previewPayout
);

// Generate/Record Payout (Treasurer only)
router.post(
  '/create',
  authenticateToken,
  authorizeRoles(ROLES.TREASURER),
  idempotencyMiddleware(),
  payoutController.createPayout
);

// Get Payout History (Owner/Treasurer)
router.get(
  '/history',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  payoutController.getHistory
);

// Mark Payout move to PAID (Treasurer only)
router.put(
  '/:id/paid',
  authenticateToken,
  authorizeRoles(ROLES.TREASURER),
  payoutController.markAsPaid
);

// Owner Acknowledgment
router.put(
  '/:id/acknowledge',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  payoutController.acknowledgePayout
);

// Owner Dispute
router.put(
  '/:id/dispute',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  payoutController.disputePayout
);

// Get Payout Details (Owner/Treasurer)
router.get(
  '/:id/details',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  payoutController.getPayoutDetails
);

// Export Payout CSV (Owner/Treasurer)
router.get(
  '/:id/export',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  payoutController.exportPayoutCSV
);

export default router;
