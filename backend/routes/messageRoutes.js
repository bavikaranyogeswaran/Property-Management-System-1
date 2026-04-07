import { Router } from 'express';
import messageController from '../controllers/messageController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';

const router = Router();

// Tenant viewing their own thread
router.get(
  '/tenant/thread',
  authenticateToken,
  authorizeRoles('tenant'),
  messageController.getTenantMessages
);
router.post(
  '/tenant/thread',
  authenticateToken,
  authorizeRoles('tenant'),
  messageController.sendTenantMessage
);
router.put(
  '/tenant/thread/read',
  authenticateToken,
  authorizeRoles('tenant'),
  messageController.markTenantRead
);

// Owner/Admin viewing specific tenant thread
router.get(
  '/owner/tenant/:tenantId',
  authenticateToken,
  authorizeRoles('owner', 'admin'),
  messageController.getTenantMessages
);
router.post(
  '/owner/tenant/:tenantId',
  authenticateToken,
  authorizeRoles('owner', 'admin'),
  messageController.sendTenantMessage
);
router.put(
  '/owner/tenant/:tenantId/read',
  authenticateToken,
  authorizeRoles('owner', 'admin'),
  messageController.markTenantRead
);

// Lead Communication (Owner/Admin only)
router.post(
  '/:leadId',
  authenticateToken,
  authorizeRoles('owner', 'admin'),
  messageController.sendMessage
);
router.get(
  '/:leadId',
  authenticateToken,
  authorizeRoles('owner', 'admin', 'tenant'),
  messageController.getMessages
);
router.put(
  '/:leadId/read',
  authenticateToken,
  authorizeRoles('owner', 'admin', 'tenant'),
  messageController.markRead
);

export default router;
