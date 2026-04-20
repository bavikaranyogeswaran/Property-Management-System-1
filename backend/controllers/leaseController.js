// ============================================================================
//  LEASE CONTROLLER (The Contract Registry)
// ============================================================================
//  This file handles the administrative actions for leases:
//  Signing contracts, terminating them, and managing deposit refunds.
// ============================================================================

import leaseService from '../services/leaseService.js';
import renewalService from '../services/renewalService.js';
import { toCentsFromMajor } from '../utils/moneyUtils.js';
import catchAsync from '../utils/catchAsync.js';

class LeaseController {
  // GET LEASES: Lists all rental agreements based on who is asking (Tenant or Staff).
  getLeases = catchAsync(async (req, res) => {
    // 1. [DELEGATION] Scope Resolver: Fetch and filter leases based on user role and property assignments
    const results = await leaseService.getLeases(req.user);
    res.json(results);
  });

  // GET LEASE BY ID: Retrieves a single contract with full billing and document history.
  getLeaseById = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Detail Resolver
    const lease = await leaseService.getLeaseById(id, req.user);
    res.json(lease);
  });

  // CREATE LEASE: Drafts a new rental contract for a tenant.
  createLease = catchAsync(async (req, res) => {
    // 1. [DELEGATION] Draftsman: Create the database record and generate a Guest Magic Link
    const result = await leaseService.createLease(req.body, null, req.user);

    res.status(201).json({
      leaseId: result.leaseId,
      magicToken: result.magicToken,
      message: 'Lease created successfully',
    });
  });

  // REJECT DOCUMENTS: Flags tenant papers as invalid and sends them back to the portal.
  rejectLeaseDocuments = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    // 1. [DELEGATION] State Rejection: Revert document status and notify the tenant
    const result = await leaseService.rejectLeaseDocuments(
      id,
      reason,
      req.user
    );

    res.status(200).json(result);
  });

  // WITHDRAW APPLICATION: Allows a prospect to cancel their draft lease before signing.
  withdrawApplication = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Cleanup: Release the unit and cancel pending invoices
    await leaseService.withdrawApplication(id, req.user);
    res.status(200).json({ message: 'Application withdrawn successfully' });
  });

  // SIGN LEASE: The final activation. Moves the lease to 'active' or 'pending'.
  signLease = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Activation Logic: Verify deposit payments, check unit status, and update occupancy
    const result = await leaseService.signLease(id, req.user);
    res.json({ message: 'Lease signed successfully', status: result.status });
  });

  // VERIFY DOCUMENTS: Staff checks the tenant's ID and other papers before activating the lease.
  verifyLeaseDocuments = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Verification: Mark documents as legally vetted by staff
    const result = await leaseService.verifyLeaseDocuments(id, req.user);
    res.json(result);
  });

  // GET DEPOSIT STATUS: Checks the current balance of the security deposit.
  getDepositStatus = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Auditor: Sum up all paid deposit invoices vs target
    const status = await leaseService.getDepositStatus(id);
    res.json(status);
  });

  // INSTANT RENEW: Extends a lease immediately without a complex negotiation.
  instantRenew = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { newEndDate, newMonthlyRent } = req.body;

    // 1. [DELEGATION] Term Extension: Create a new lease record or extend the existing one
    const result = await renewalService.instantRenew(
      id,
      newEndDate,
      Number(newMonthlyRent),
      req.user
    );
    res.json({ message: 'Lease instantly renewed successfully', ...result });
  });

  // REFUND DEPOSIT: Staff calculates and submits a refund request for a departing tenant.
  refundDeposit = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { amount, notes } = req.body;

    // 1. [DELEGATION] Refund Logic: Record deductions and stage the refund for approval
    const result = await leaseService.requestRefund(
      id,
      Number(amount),
      notes,
      req.user
    );
    res.json({ message: 'Deposit refund requested successfully', ...result });
  });

  // APPROVE REFUND: Owner or Treasurer authorizes the bank transfer.
  approveRefund = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Financial Execution: Finalize the ledger and release funds
    const result = await leaseService.approveRefund(id, req.user);
    res.json({
      message: 'Refund approved and executed successfully',
      ...result,
    });
  });

  // DISPUTE REFUND: Allows a second staff member or owner to block a suspect refund.
  disputeRefund = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    // 1. [DELEGATION] Conflict Marker
    const result = await leaseService.disputeRefund(id, notes, req.user);
    res.json({ message: 'Refund request marked as disputed', ...result });
  });

  // TERMINATE LEASE: Ends a rental agreement, often with a final move-out date.
  terminateLease = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { terminationDate, terminationFee } = req.body;

    // 1. [DELEGATION] Exit Logic: Handle notice periods, calculate fees, and schedule unit vacancy
    const result = await leaseService.terminateLease(
      id,
      terminationDate,
      Number(terminationFee),
      req.user
    );
    res.json({ message: 'Lease terminated successfully', ...result });
  });

  // UPDATE LEASE DOCUMENT: Swaps out the contract PDF (e.g., if a mistake was corrected).
  updateLeaseDocument = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { documentUrl } = req.body;

    // 1. [DELEGATION] Asset Swap
    await leaseService.updateLeaseDocument(id, documentUrl, req.user);
    res.json({ message: 'Lease document updated successfully', documentUrl });
  });

  // UPDATE NOTICE STATUS: Records if the tenant has officially given notice to leave.
  updateNoticeStatus = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    // 1. [DELEGATION] Status Update
    await leaseService.updateNoticeStatus(id, status, req.user);
    res.json({ message: 'Notice status updated successfully', status });
  });

  // ADD RENT ADJUSTMENT: Adds a future price change to a lease term.
  addRentAdjustment = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { effectiveDate, newMonthlyRent, notes } = req.body;

    // 1. [DELEGATION] Billing Engine Adjustment: Record the future rent value and its effective date
    const adjustmentId = await leaseService.addRentAdjustment(
      id,
      {
        effectiveDate,
        newMonthlyRent: toCentsFromMajor(newMonthlyRent),
        notes,
      },
      req.user
    );

    res
      .status(201)
      .json({ message: 'Rent adjustment added successfully', adjustmentId });
  });

  // GET RENT ADJUSTMENTS: Lists all historical and future price changes.
  getRentAdjustments = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Timeline Resolver
    const adjustments = await leaseService.getRentAdjustments(id, req.user);
    res.json(adjustments);
  });

  // FINALIZE CHECKOUT: The absolute last step. Ends the lease and moves the unit to 'vacant'.
  finalizeCheckout = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Final Reconciliation: Sync unit status and close the lease ledger
    const result = await leaseService.finalizeLeaseCheckout(id, req.user);
    res.json({ message: 'Lease checkout finalized successfully', ...result });
  });

  // RESOLVE REFUND DISPUTE: Final arbitration of a contested deposit return.
  resolveRefundDispute = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { adjustedAmount } = req.body;
    // 1. [DELEGATION] Arbitration Logic
    const result = await leaseService.resolveRefundDispute(
      id,
      req.user,
      Number(adjustedAmount)
    );
    res.json(result);
  });

  // ACKNOWLEDGE REFUND: Tenant confirming they received their money.
  acknowledgeRefund = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Confirmation Logic
    const result = await leaseService.acknowledgeRefund(id, req.user.id);
    res.json(result);
  });

  // RECORD DISBURSEMENT: Records the actual bank transfer details for a refund.
  recordDisbursement = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Evidence Logging: Attach payout reference (check # or bank TRX ID)
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

  // CANCEL LEASE: Hard delete or archive of a draft lease that never started.
  cancelLease = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Scythe Logic: Remove the lease and reset the unit availability
    await leaseService.cancelLease(id, req.user);
    res.json({
      message: 'Lease cancelled successfully and unit status updated.',
    });
  });

  // REGENERATE MAGIC TOKEN: Sends a fresh Guest Portal link to the applicant.
  regenerateMagicToken = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Token Rotation & Notification
    await leaseService.regenerateMagicLink(id, req.user);
    res.json({
      message: 'New magic link generated and sent to tenant successfully.',
    });
  });
}

export default new LeaseController();
