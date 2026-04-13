import express from 'express';
import { applyLateFees } from '../utils/cronJobs.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

const router = express.Router();

// Trigger Late Fee Automation Manually
// Restricted to Owners and Treasurers
router.post('/trigger-late-fees', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== ROLES.OWNER && req.user.role !== ROLES.TREASURER) {
      return res.status(403).json({
        error:
          'Access denied. Only Owners or Treasurers can trigger late fees.',
      });
    }

    console.log(
      `Manual Late Fee Triggered by ${req.user.name} (${req.user.role})`
    );

    // This is an async function in cronJobs.js
    await applyLateFees();

    res.json({
      status: 'ok',
      message: 'Late fee automation completed successfully.',
    });
  } catch (error) {
    console.error('Manual Late Fee Trigger Failed:', error);
    res.status(500).json({ error: 'Failed to complete late fee automation.' });
  }
});

export default router;
