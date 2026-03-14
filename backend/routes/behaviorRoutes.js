import express from 'express';
import {
  addBehaviorLog,
  getTenantBehavior,
  getMyBehavior,
} from '../controllers/behaviorController.js';
import authenticateToken, { authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Route: /api/behavior/my-score (Tenant only)
router.get('/my-score', authenticateToken, authorizeRoles('tenant'), getMyBehavior);

// Routes for Staff/Owners: /api/behavior/:tenantId
router.post('/:tenantId', authenticateToken, authorizeRoles('owner', 'treasurer'), addBehaviorLog);
router.get('/:tenantId', authenticateToken, authorizeRoles('owner', 'treasurer'), getTenantBehavior);

export default router;
