import db from '../config/db.js';
import { executeNightlyPayload } from '../utils/cronJobs.js';

// ============================================================================
//  SYSTEM CONTROLLER (The System Core)
// ============================================================================
//  This file handles the heartbeat operations of the platform.
//  It triggers automated daily tasks like rent billing and penalty calculation.
// ============================================================================

// GET CRON LOGS: Returns a history of all background jobs executed.
export const getCronLogs = async (req, res) => {
  try {
    const [logs] = await db.query(
      'SELECT * FROM cron_logs ORDER BY execution_date DESC, started_at DESC LIMIT 50'
    );
    res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching cron logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// TRIGGER CRON: Manually forces the daily automated checks to run (for testing/fixing).
export const triggerCron = async (req, res) => {
  try {
    console.log(`[Admin] Manual cron trigger by User ${req.user.id}`);
    // We run this asynchronously so the request doesn't timeout
    executeNightlyPayload().catch((err) => {
      console.error('[Admin] Manual cron trigger failed:', err);
    });

    res.status(202).json({
      message: 'Cron job manual trigger accepted and running in background.',
    });
  } catch (error) {
    console.error('Error triggering cron:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export default {
  getCronLogs,
  triggerCron,
};
