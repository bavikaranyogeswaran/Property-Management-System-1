import renewalService from '../services/renewalService.js';
import catchAsync from '../utils/catchAsync.js';

class RenewalController {
  getRequests = catchAsync(async (req, res) => {
    const results = await renewalService.getRequests(req.user);
    res.json(results);
  });

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

  approveRenewal = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await renewalService.approve(id, req.user);
    res.json({
      message: 'Renewal approved and draft lease created',
      ...result,
    });
  });

  tenantAccept = catchAsync(async (req, res) => {
    const { id } = req.params;
    await renewalService.tenantAccept(id, req.user);
    res.json({
      message: 'Renewal terms accepted. Awaiting final staff approval.',
    });
  });

  tenantDecline = catchAsync(async (req, res) => {
    const { id } = req.params;
    await renewalService.tenantDecline(id, req.user);
    res.json({
      message: 'Renewal terms declined. Staff will be notified to revise.',
    });
  });

  rejectRenewal = catchAsync(async (req, res) => {
    const { id } = req.params;
    await renewalService.reject(id, req.user);
    res.json({ message: 'Renewal request rejected' });
  });
}

export default new RenewalController();
