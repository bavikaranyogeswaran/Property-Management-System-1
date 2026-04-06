import { Router } from 'express';
import leaseController from '../controllers/leaseController.js';
import {
  authenticateToken,
  authorizeResource,
} from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, leaseController.getLeases);
router.post('/', authenticateToken, leaseController.createLease);

// All routes below this line require lease-level authorization
router.get(
  '/:id',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.getLeaseById
);
router.post(
  '/:id/instant-renew',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.instantRenew
);
router.post(
  '/:id/refund',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.refundDeposit
);
router.post(
  '/:id/refund/approve',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.approveRefund
);
router.post(
  '/:id/refund/dispute',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.disputeRefund
);
router.post(
  '/:id/refund/disburse',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.recordDisbursement
);
router.post(
  '/:id/refund/resolve',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.resolveRefundDispute
);
router.patch(
  '/:id/document',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.updateLeaseDocument
);
router.post(
  '/:id/terminate',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.terminateLease
);
router.patch(
  '/:id/notice-status',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.updateNoticeStatus
);
router.get(
  '/:id/adjustments',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.getRentAdjustments
);
router.post(
  '/:id/adjustments',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.addRentAdjustment
);
router.post(
  '/:id/finalize-checkout',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.finalizeCheckout
);
router.post(
  '/:id/deposit-status',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.getDepositStatus
);
router.post(
  '/:id/acknowledge-refund',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.acknowledgeRefund
);
router.post(
  '/:id/verify-documents',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.verifyLeaseDocuments
);
router.post(
  '/:id/reject-documents',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.rejectLeaseDocuments
);
router.post(
  '/:id/withdraw',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.withdrawApplication
);
router.delete(
  '/:id',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.cancelLease
);
router.post(
  '/:id/sign',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.signLease
);
router.post(
  '/:id/regenerate-token',
  authenticateToken,
  authorizeResource('lease'),
  leaseController.regenerateMagicToken
);

export default router;
