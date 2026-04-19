import visitService from '../services/visitService.js';
import catchAsync from '../utils/catchAsync.js';

// ============================================================================
//  VISIT CONTROLLER (The Tour Guide)
// ============================================================================
//  This file handles the scheduling of property viewings by leads.
//  It integrates public interest into actionable timeslots for staff.
// ============================================================================

class VisitController {
  // SCHEDULE VISIT: A prospect picks a time to look at a property.
  scheduleVisit = catchAsync(async (req, res) => {
    const result = await visitService.scheduleVisit(req.body);

    res.status(201).json({
      message: `Visit scheduled successfully for ${result.roundedTime}`,
      ...result,
    });
  });

  // CANCEL VISIT: A lead or staff member cancels the showing.
  cancelVisit = catchAsync(async (req, res) => {
    const { id } = req.params;
    await visitService.cancelVisit(id, req.user);
    res.json({ message: 'Visit cancelled successfully' });
  });

  // GET VISITS: List out all booked tours for today or the future.
  getVisits = catchAsync(async (req, res) => {
    // Assuming auth middleware puts user in req.user
    const visits = await visitService.getVisits(req.user);
    res.json(visits);
  });

  // UPDATE STATUS: Marks if a lead actually showed up or "No-Showed" the tour.
  updateStatus = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    await visitService.updateStatus(id, status, req.user);
    res.json({ message: 'Visit status updated' });
  });

  // RESCHEDULE VISIT: Staff moves a tour to a new time.
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
