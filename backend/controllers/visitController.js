import visitService from '../services/visitService.js';
import catchAsync from '../utils/catchAsync.js';

class VisitController {
  /**
   * Schedule a new visit.
   * Looks up existing lead by email/phone or creates a new one.
   */
  scheduleVisit = catchAsync(async (req, res) => {
    const result = await visitService.scheduleVisit(req.body);

    res.status(201).json({
      message: `Visit scheduled successfully for ${result.roundedTime}`,
      ...result,
    });
  });

  cancelVisit = catchAsync(async (req, res) => {
    const { id } = req.params;
    await visitService.cancelVisit(id, req.user);
    res.json({ message: 'Visit cancelled successfully' });
  });

  getVisits = catchAsync(async (req, res) => {
    // Assuming auth middleware puts user in req.user
    const visits = await visitService.getVisits(req.user);
    res.json(visits);
  });

  updateStatus = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    await visitService.updateStatus(id, status, req.user);
    res.json({ message: 'Visit status updated' });
  });

  rescheduleVisit = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await visitService.rescheduleVisit(id, req.body, req.user);
    res.json({
      message: 'Visit rescheduled successfully',
      scheduledDate: result.scheduledDate,
    });
  });
}

export default new VisitController();
