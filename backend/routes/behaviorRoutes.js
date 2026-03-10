import express from 'express';
import {
  addBehaviorLog,
  getTenantBehavior,
} from '../controllers/behaviorController.js';

const router = express.Router();

// Route: /api/behavior/:tenantId
router.post('/:tenantId', addBehaviorLog);
router.get('/:tenantId', getTenantBehavior);

export default router;
