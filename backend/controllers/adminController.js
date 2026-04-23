import { applyLateFees } from '../utils/cronJobs.js';
import catchAsync from '../utils/catchAsync.js';

class AdminController {
  triggerLateFees = catchAsync(async (req, res) => {
    console.log(
      `Manual Late Fee Triggered by ${req.user?.name || 'User'} (${req.user?.role || 'Unknown'})`
    );

    // This is an async function in cronJobs.js
    await applyLateFees();

    res.json({
      status: 'ok',
      message: 'Late fee automation completed successfully.',
    });
  });
}

export default new AdminController();
