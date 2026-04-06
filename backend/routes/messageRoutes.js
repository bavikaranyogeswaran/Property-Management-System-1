import { Router } from 'express';
import messageController from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = Router();

// --- TENANT ROUTES ---
// Tenant viewing their own thread
router.get(
  '/tenant/thread',
  authenticateToken,
  messageController.getTenantMessages
);
router.post(
  '/tenant/thread',
  authenticateToken,
  messageController.sendTenantMessage
);
router.put(
  '/tenant/thread/read',
  authenticateToken,
  messageController.markTenantRead
);

// Owner/Admin viewing specific tenant thread
router.get(
  '/owner/tenant/:tenantId',
  authenticateToken,
  messageController.getTenantMessages
);
router.post(
  '/owner/tenant/:tenantId',
  authenticateToken,
  messageController.sendTenantMessage
);
router.put(
  '/owner/tenant/:tenantId/read',
  authenticateToken,
  messageController.markTenantRead
);

// --- LEAD ROUTES ---
// Send a message to a lead (owner/admin only)
router.post('/:leadId', authenticateToken, messageController.sendMessage);

// Get all messages for a lead
router.get('/:leadId', authenticateToken, messageController.getMessages);

// Mark messages as read
router.put('/:leadId/read', authenticateToken, messageController.markRead);

export default router;
