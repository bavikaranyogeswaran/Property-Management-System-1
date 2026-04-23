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
    // 1. [DELEGATION] Scope Resolver: Fetch negotiations filtered by user role and property assignments
    const results = await renewalService.getRequests(req.user);
    res.json(results);
  });

  // PROPOSE TERMS: Staff sends a new rent rate and duration to a tenant.
  proposeTerms = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { proposedMonthlyRent, proposedEndDate, notes } = req.body;

    // [S2 FIX] Manual validation removed — input is now validated by proposeTermsSchema
    // via validateRequest() middleware in renewalRoutes.js before reaching this handler.

    // 2. [DELEGATION] State Transition: Move status to 'proposed' and record the staff's offer
    await renewalService.proposeTerms(
      id,
      { proposedMonthlyRent, proposedEndDate, notes },
      req.user
    );

    res.json({ message: 'Renewal terms proposed successfully' });
  });

  // APPROVE RENEWAL: Final staff step. Turns the accepted terms into an active lease contract.
  approveRenewal = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Agreement Finalization: Generate the new lease record and close the negotiation thread
    const result = await renewalService.approve(id, req.user);
    res.json({
      message: 'Renewal approved and draft lease created',
      ...result,
    });
  });

  // TENANT ACCEPT: Tenant agrees to the newly proposed rent and duration.
  tenantAccept = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] State Transition: Move status to 'tenant_accepted'
    await renewalService.tenantAccept(id, req.user);
    res.json({
      message: 'Renewal terms accepted. Awaiting final staff approval.',
    });
  });

  // TENANT DECLINE: Tenant rejects the offer, allowing staff to revise it.
  tenantDecline = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Conflict Marker
    await renewalService.tenantDecline(id, req.user);
    res.json({
      message: 'Renewal terms declined. Staff will be notified to revise.',
    });
  });

  // REJECT RENEWAL: Staff abruptly terminates the negotiation process.
  rejectRenewal = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Termination Logic
    await renewalService.reject(id, req.user);
    res.json({ message: 'Renewal request rejected' });
  });
}

export default new RenewalController();
