import { Router } from 'express';
import leaseController from '../controllers/leaseController.js';
import {
  authenticateToken,
  authorizeRoles,
  authorizeResource,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

const router = Router();

router.get(
  '/',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER, ROLES.TENANT),
  leaseController.getLeases
);
router.post(
  '/',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  leaseController.createLease
);

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
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  authorizeResource('lease', 'id', 'params'),
  leaseController.instantRenew
);
router.post(
  '/:id/refund',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  authorizeResource('lease', 'id', 'params'),
  leaseController.refundDeposit
);
router.patch(
  '/:id/refund/approve',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  authorizeResource('lease', 'id', 'params'),
  leaseController.approveRefund
);
router.patch(
  '/:id/refund/dispute',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
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
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  authorizeResource('lease', 'id', 'params'),
  leaseController.updateLeaseDocument
);
router.post(
  '/:id/terminate',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
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
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  authorizeResource('lease', 'id', 'params'),
  leaseController.finalizeCheckout
);
router.get(
  '/:id/deposit-status',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.getDepositStatus
);
router.patch(
  '/:id/acknowledge-refund',
  authenticateToken,
  authorizeResource('lease', 'id', 'params'),
  leaseController.acknowledgeRefund
);
router.patch(
  '/:id/verify-documents',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  authorizeResource('lease', 'id', 'params'),
  leaseController.verifyLeaseDocuments
);
router.patch(
  '/:id/reject-documents',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
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
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
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
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  authorizeResource('lease'),
  leaseController.regenerateMagicToken
);

export default router;
