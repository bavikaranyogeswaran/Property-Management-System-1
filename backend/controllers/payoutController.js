// ============================================================================
//  PAYOUT CONTROLLER (The Owner's Paymaster)
// ============================================================================
//  This file handles sending money OUT to property owners.
//  It calculates how much an owner is owed (Rent minus Expenses) and
//  records when the money has been sent to them.
// ============================================================================

import payoutService from '../services/payoutService.js';
import authorizationService from '../services/authorizationService.js';

import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

class PayoutController {
  // 1. Preview (Calculate but don't save)
  // PREVIEW PAYOUT: Calculates the expected profit sharing (Rent minus Expenses) before officially saving it.
  previewPayout = catchAsync(async (req, res) => {
    const { ownerId, startDate, endDate } = req.query;
    if (!ownerId || !endDate) {
      throw new AppError('Owner ID and End date are required', 400);
    }

    // 1. [SECURITY] Deployment Guard: Verify the staff member is assigned to at least one of this owner's properties
    if (
      !(await authorizationService.canAccessOwner(
        req.user.id,
        req.user.role,
        ownerId
      ))
    ) {
      throw new AppError(
        'Access denied: You are not assigned to any properties for this owner',
        403
      );
    }

    const selection = {
      incomeIds: req.query.incomeIds
        ? Array.isArray(req.query.incomeIds)
          ? req.query.incomeIds
          : [req.query.incomeIds]
        : null,
      expenseIds: req.query.expenseIds
        ? Array.isArray(req.query.expenseIds)
          ? req.query.expenseIds
          : [req.query.expenseIds]
        : null,
    };

    // 2. [DELEGATION] Virtual Ledger: Run the math on the global income/expense pool without committing to a payout record
    const calculation = await payoutService.previewPayout(
      ownerId,
      startDate,
      endDate,
      selection
    );
    res.json(calculation);
  });

  // CREATE PAYOUT: Officially records a payout which then needs to be paid by the bank.
  createPayout = catchAsync(async (req, res) => {
    const { ownerId, startDate, endDate, selection } = req.body;
    if (!ownerId) {
      throw new AppError('Owner ID is required', 400);
    }

    // 1. [SECURITY] Authorization Guard
    if (
      !(await authorizationService.canAccessOwner(
        req.user.id,
        req.user.role,
        ownerId
      ))
    ) {
      throw new AppError(
        'Access denied: You are not assigned to any properties for this owner',
        403
      );
    }

    // 2. [DELEGATION] Financial Commitment: Seal the income/expense records and create the payout header
    const { payoutId, netPayout } = await payoutService.createPayout(
      ownerId,
      startDate,
      endDate,
      selection
    );

    res
      .status(201)
      .json({ message: 'Payout record created', payoutId, netPayout });
  });

  // GET HISTORY: Shows a list of all past money transfers to a specific owner.
  getHistory = catchAsync(async (req, res) => {
    const ownerId = req.query.ownerId || req.user.id;

    // 1. [SECURITY] Scope Guard
    if (
      !(await authorizationService.canAccessOwner(
        req.user.id,
        req.user.role,
        ownerId
      ))
    ) {
      throw new AppError(
        "Access denied: You do not have permission to view this owner's data",
        403
      );
    }

    // 2. [DATA] Narrative Resolver
    const payouts = await payoutService.getHistory(ownerId);
    res.json(payouts);
  });

  // MARK AS PAID: Treasurer step. Confirms the money is out of our account and into the owner's.
  markAsPaid = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { bankReference, proofUrl } = req.body;

    // 1. [SECURITY] Resolve record and verify access
    const fullPayout = await payoutService.getPayoutById(id);
    if (!fullPayout) {
      throw new AppError('Payout not found', 404);
    }

    if (
      !(await authorizationService.canAccessOwner(
        req.user.id,
        req.user.role,
        fullPayout.owner_id
      ))
    ) {
      throw new AppError(
        'Access denied: You are not assigned to this property owner',
        403
      );
    }

    if (!bankReference) {
      throw new AppError(
        'Bank reference is required for payment verification',
        400
      );
    }

    // 2. [DELEGATION] State Finalization: Record the transaction ID and move status to 'paid'
    await payoutService.markAsPaid(id, req.user.id, bankReference, proofUrl);
    res.json({
      message: 'Payout marked as paid and sent to owner for acknowledgment',
    });
  });

  // GET PAYOUT DETAILS: Retrieves the itemized list of rents and maintenance costs that make up a payout.
  getPayoutDetails = catchAsync(async (req, res) => {
    const { id } = req.params;
    const fullPayout = await payoutService.getPayoutById(id);
    if (!fullPayout) {
      throw new AppError('Payout not found', 404);
    }

    // 1. [SECURITY] RBAC & Assignment check
    if (
      !(await authorizationService.canAccessOwner(
        req.user.id,
        req.user.role,
        fullPayout.owner_id
      ))
    ) {
      throw new AppError(
        'Access denied: You are not authorized to view these details',
        403
      );
    }

    // 2. [DELEGATION] Line Item Resolver
    const details = await payoutService.getPayoutDetails(
      fullPayout.owner_id,
      id
    );
    res.json(details);
  });

  // ACKNOWLEDGE PAYOUT: Owner confirming they received their monthly profit.
  acknowledgePayout = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DATA] Receipting Logic
    await payoutService.acknowledgePayout(req.user.id, id);
    res.json({ message: 'Payout acknowledged successfully' });
  });

  // DISPUTE PAYOUT: Allows the owner to flag a payout if they think the expenses are too high.
  disputePayout = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason) {
      throw new AppError('Reason for dispute is required', 400);
    }

    // 1. [DATA] Conflict Marker
    await payoutService.disputePayout(req.user.id, id, reason);
    res.json({ message: 'Payout marked as disputed' });
  });

  // EXPORT PAYOUT CSV: Generates a reconciliation sheet for owner's bookkeeping.
  exportPayoutCSV = catchAsync(async (req, res) => {
    const { id } = req.params;
    const fullPayout = await payoutService.getPayoutById(id);
    if (!fullPayout) {
      throw new AppError('Payout not found', 404);
    }

    // 1. [SECURITY] Guard
    if (
      !(await authorizationService.canAccessOwner(
        req.user.id,
        req.user.role,
        fullPayout.owner_id
      ))
    ) {
      throw new AppError(
        'Access denied: You are not authorized to export this data',
        403
      );
    }

    // 2. [DELEGATION] Report Generation
    const csv = await payoutService.exportPayoutCSV(fullPayout.owner_id, id);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=payout_reconciliation_${id}.csv`
    );
    res.status(200).send(csv);
  });
}

export default new PayoutController();
