import { Router } from 'express';
import messageController from '../controllers/messageController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

// Send a message to a lead (owner/admin only)
router.post('/:leadId', authenticateToken, messageController.sendMessage);

// Get all messages for a lead
router.get('/:leadId', authenticateToken, messageController.getMessages);

// Mark messages as read
router.put('/:leadId/read', authenticateToken, messageController.markRead);

export default router;
