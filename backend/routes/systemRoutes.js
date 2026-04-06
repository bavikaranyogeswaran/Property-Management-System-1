import express from 'express';
import systemController from '../controllers/systemController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';

const router = express.Router();

// Only owners should be able to see system logs and trigger crons
router.get(
  '/cron-logs',
  authenticateToken,
  authorizeRoles('owner'),
  systemController.getCronLogs
);
router.post(
  '/cron-run',
  authenticateToken,
  authorizeRoles('owner'),
  systemController.triggerCron
);

export default router;
