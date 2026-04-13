import express from 'express';
import {
  addBehaviorLog,
  getTenantBehavior,
  getMyBehavior,
} from '../controllers/behaviorController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

const router = express.Router();

// Route: /api/behavior/my-score (Tenant only)
router.get(
  '/my-score',
  authenticateToken,
  authorizeRoles(ROLES.TENANT),
  getMyBehavior
);

// Routes for Staff/Owners: /api/behavior/:tenantId
router.post(
  '/:tenantId',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  addBehaviorLog
);
router.get(
  '/:tenantId',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  getTenantBehavior
);

export default router;
