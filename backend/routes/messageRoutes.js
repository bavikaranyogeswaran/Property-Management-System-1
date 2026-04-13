import { Router } from 'express';
import messageController from '../controllers/messageController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

const router = Router();

// Tenant viewing their own thread
router.get(
  '/tenant/thread',
  authenticateToken,
  authorizeRoles(ROLES.TENANT),
  messageController.getTenantMessages
);
router.post(
  '/tenant/thread',
  authenticateToken,
  authorizeRoles(ROLES.TENANT),
  messageController.sendTenantMessage
);
router.put(
  '/tenant/thread/read',
  authenticateToken,
  authorizeRoles(ROLES.TENANT),
  messageController.markTenantRead
);

// Owner/Admin viewing specific tenant thread
router.get(
  '/owner/tenant/:tenantId',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.SYSTEM),
  messageController.getTenantMessages
);
router.post(
  '/owner/tenant/:tenantId',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.SYSTEM),
  messageController.sendTenantMessage
);
router.put(
  '/owner/tenant/:tenantId/read',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.SYSTEM),
  messageController.markTenantRead
);

// Lead Communication (Owner/Admin only)
router.post(
  '/:leadId',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.SYSTEM),
  messageController.sendMessage
);
router.get(
  '/:leadId',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.SYSTEM, ROLES.TENANT),
  messageController.getMessages
);
router.put(
  '/:leadId/read',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.SYSTEM, ROLES.TENANT),
  messageController.markRead
);

export default router;
