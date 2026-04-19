import renewalService from '../services/renewalService.js';
import catchAsync from '../utils/catchAsync.js';

// ============================================================================
//  RENEWAL CONTROLLER (The Lease Renewer)
// ============================================================================
//  This file handles the negotiation process as a lease approaches its end.
//  It facilitates back-and-forth between staff proposing terms and tenants
//  accepting or declining them.
// ============================================================================

class RenewalController {
  // GET REQUESTS: Lists all active lease renewal negotiations for a user.
  getRequests = catchAsync(async (req, res) => {
    const results = await renewalService.getRequests(req.user);
    res.json(results);
  });

  // PROPOSE TERMS: Staff sends a new rent rate and duration to a tenant.
  proposeTerms = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { proposedMonthlyRent, proposedEndDate, notes } = req.body;

    if (!proposedMonthlyRent || !proposedEndDate) {
      return res
        .status(400)
        .json({ error: 'Proposed rent and end date are required' });
    }

    await renewalService.proposeTerms(
      id,
      {
        proposedMonthlyRent,
        proposedEndDate,
        notes,
      },
      req.user
    );

    res.json({ message: 'Renewal terms proposed successfully' });
  });

  // APPROVE RENEWAL: Final staff step. Turns the accepted terms into an active lease contract.
  approveRenewal = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await renewalService.approve(id, req.user);
    res.json({
      message: 'Renewal approved and draft lease created',
      ...result,
    });
  });

  // TENANT ACCEPT: Tenant agrees to the newly proposed rent and duration.
  tenantAccept = catchAsync(async (req, res) => {
    const { id } = req.params;
    await renewalService.tenantAccept(id, req.user);
    res.json({
      message: 'Renewal terms accepted. Awaiting final staff approval.',
    });
  });

  // TENANT DECLINE: Tenant rejects the offer, allowing staff to revise it.
  tenantDecline = catchAsync(async (req, res) => {
    const { id } = req.params;
    await renewalService.tenantDecline(id, req.user);
    res.json({
      message: 'Renewal terms declined. Staff will be notified to revise.',
    });
  });

  // REJECT RENEWAL: Staff abruptly terminates the negotiation process.
  rejectRenewal = catchAsync(async (req, res) => {
    const { id } = req.params;
    await renewalService.reject(id, req.user);
    res.json({ message: 'Renewal request rejected' });
  });
}

export default new RenewalController();
