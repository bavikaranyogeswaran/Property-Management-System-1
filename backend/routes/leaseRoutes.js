import { Router } from 'express';
import leaseController from '../controllers/leaseController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, leaseController.getLeases);
router.post('/', authenticateToken, leaseController.createLease);
router.get('/:id', authenticateToken, leaseController.getLeaseById);
router.post('/:id/instant-renew', authenticateToken, leaseController.instantRenew);
router.post('/:id/refund', authenticateToken, leaseController.refundDeposit);
router.post('/:id/refund/approve', authenticateToken, leaseController.approveRefund);
router.post('/:id/refund/dispute', authenticateToken, leaseController.disputeRefund);
router.post('/:id/refund/resolve', authenticateToken, leaseController.resolveRefundDispute);
router.patch('/:id/document', authenticateToken, leaseController.updateLeaseDocument);
router.post(
  '/:id/terminate',
  authenticateToken,
  leaseController.terminateLease
);
router.patch('/:id/notice-status', authenticateToken, leaseController.updateNoticeStatus);
router.get('/:id/adjustments', authenticateToken, leaseController.getRentAdjustments);
router.post('/:id/adjustments', authenticateToken, leaseController.addRentAdjustment);
router.post('/:id/finalize-checkout', authenticateToken, leaseController.finalizeCheckout);
router.get('/:id/deposit-status', authenticateToken, leaseController.getDepositStatus);
router.post('/:id/sign', authenticateToken, leaseController.signLease);

export default router;
