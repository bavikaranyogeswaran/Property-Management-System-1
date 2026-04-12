import leaseService from '../services/leaseService.js';
import renewalService from '../services/renewalService.js';
import { toCentsFromMajor } from '../utils/moneyUtils.js';
import catchAsync from '../utils/catchAsync.js';

class LeaseController {
  getLeases = catchAsync(async (req, res) => {
    const results = await leaseService.getLeases(req.user);
    res.json(results);
  });

  getLeaseById = catchAsync(async (req, res) => {
    const { id } = req.params;
    const lease = await leaseService.getLeaseById(id, req.user);
    res.json(lease);
  });

  createLease = catchAsync(async (req, res) => {
    const result = await leaseService.createLease(req.body, null, req.user);
    res.status(201).json({
      leaseId: result.leaseId,
      magicToken: result.magicToken,
      message: 'Lease created successfully',
    });
  });

  rejectLeaseDocuments = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const result = await leaseService.rejectLeaseDocuments(
      id,
      reason,
      req.user
    );
    res.status(200).json(result);
  });

  withdrawApplication = catchAsync(async (req, res) => {
    const { id } = req.params;
    await leaseService.withdrawApplication(id, req.user);
    res.status(200).json({ message: 'Application withdrawn successfully' });
  });

  signLease = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await leaseService.signLease(id, req.user);
    res.json({ message: 'Lease signed successfully', status: result.status });
  });

  verifyLeaseDocuments = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await leaseService.verifyLeaseDocuments(id, req.user);
    res.json(result);
  });

  getDepositStatus = catchAsync(async (req, res) => {
    const { id } = req.params;
    const status = await leaseService.getDepositStatus(id);
    res.json(status);
  });

  instantRenew = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { newEndDate, newMonthlyRent } = req.body;

    const result = await renewalService.instantRenew(
      id,
      newEndDate,
      toCentsFromMajor(newMonthlyRent),
      req.user
    );
    res.json({ message: 'Lease instantly renewed successfully', ...result });
  });

  refundDeposit = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { amount, notes } = req.body;

    const result = await leaseService.requestRefund(
      id,
      toCentsFromMajor(amount),
      notes,
      req.user
    );
    res.json({ message: 'Deposit refund requested successfully', ...result });
  });

  approveRefund = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await leaseService.approveRefund(id, req.user);
    res.json({
      message: 'Refund approved and executed successfully',
      ...result,
    });
  });

  disputeRefund = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    const result = await leaseService.disputeRefund(id, notes, req.user);
    res.json({ message: 'Refund request marked as disputed', ...result });
  });

  terminateLease = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { terminationDate, terminationFee } = req.body; // Fee optional

    const result = await leaseService.terminateLease(
      id,
      terminationDate,
      toCentsFromMajor(terminationFee),
      req.user
    );
    res.json({ message: 'Lease terminated successfully', ...result });
  });

  updateLeaseDocument = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { documentUrl } = req.body;

    if (!documentUrl) {
      return res.status(400).json({ error: 'documentUrl is required' });
    }

    await leaseService.updateLeaseDocument(id, documentUrl, req.user);
    res.json({ message: 'Lease document updated successfully', documentUrl });
  });

  updateNoticeStatus = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    await leaseService.updateNoticeStatus(id, status, req.user);
    res.json({ message: 'Notice status updated successfully', status });
  });

  addRentAdjustment = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { effectiveDate, newMonthlyRent, notes } = req.body;

    if (!effectiveDate || !newMonthlyRent) {
      return res
        .status(400)
        .json({ error: 'effectiveDate and newMonthlyRent are required' });
    }

    const adjustmentId = await leaseService.addRentAdjustment(
      id,
      {
        effectiveDate,
        newMonthlyRent: toCentsFromMajor(newMonthlyRent),
        notes,
      },
      req.user
    );

    res.status(201).json({
      message: 'Rent adjustment added successfully',
      adjustmentId,
    });
  });

  getRentAdjustments = catchAsync(async (req, res) => {
    const { id } = req.params;
    const adjustments = await leaseService.getRentAdjustments(id, req.user);
    res.json(adjustments);
  });

  finalizeCheckout = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await leaseService.finalizeLeaseCheckout(id, req.user);
    res.json({ message: 'Lease checkout finalized successfully', ...result });
  });

  resolveRefundDispute = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { adjustedAmount } = req.body;
    if (adjustedAmount === undefined || adjustedAmount < 0) {
      return res
        .status(400)
        .json({ error: 'Valid adjustedAmount is required' });
    }
    const result = await leaseService.resolveRefundDispute(
      id,
      req.user,
      toCentsFromMajor(adjustedAmount)
    );
    res.json(result);
  });

  acknowledgeRefund = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await leaseService.acknowledgeRefund(id, req.user.id);
    res.json(result);
  });

  recordDisbursement = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await leaseService.confirmDisbursement(
      id,
      req.body,
      req.user
    );
    res.json({
      message: 'Disbursement recorded and refund finalized.',
      ...result,
    });
  });

  cancelLease = catchAsync(async (req, res) => {
    const { id } = req.params;
    await leaseService.cancelLease(id, req.user);
    res.json({
      message: 'Lease cancelled successfully and unit status updated.',
    });
  });

  regenerateMagicToken = catchAsync(async (req, res) => {
    const { id } = req.params;
    await leaseService.regenerateMagicLink(id, req.user);
    res.json({
      message: 'New magic link generated and sent to tenant successfully.',
    });
  });
}

export default new LeaseController();
