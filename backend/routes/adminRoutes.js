import express from 'express';
import adminController from '../controllers/adminController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

const router = express.Router();

// Trigger Late Fee Automation Manually
// Restricted to Owners and Treasurers
router.post(
  '/trigger-late-fees',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  adminController.triggerLateFees
);

export default router;
