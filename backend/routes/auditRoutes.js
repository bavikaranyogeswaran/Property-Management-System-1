import { Router } from 'express';
import auditController from '../controllers/auditController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

const router = Router();

router.get(
  '/',
  authenticateToken,
  authorizeRoles(ROLES.OWNER),
  auditController.getLogs
);

export default router;
