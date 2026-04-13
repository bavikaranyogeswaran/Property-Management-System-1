import express from 'express';
import systemController from '../controllers/systemController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

const router = express.Router();

// Only owners should be able to see system logs and trigger crons
router.get(
  '/cron-logs',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  systemController.getCronLogs
);
router.post(
  '/cron-run',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  systemController.triggerCron
);

export default router;
