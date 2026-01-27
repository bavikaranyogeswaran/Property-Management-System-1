import express from 'express';
import leadController from '../controllers/leadController.js';
import authenticateToken from '../middleware/authMiddleware.js';

import messageController from '../controllers/messageController.js';

const router = express.Router();

// Public route - Create Lead
router.post('/', leadController.createLead);

// Protected routes
router.use(authenticateToken);

router.get('/', leadController.getLeads);
router.get('/stage-history', leadController.getLeadStageHistory);
router.get('/my-profile', leadController.getMyLead);
router.put('/:id', leadController.updateLead);
router.post('/:id/convert', leadController.convertLead);

// Message Routes
// Note: We use mergeParams implicitly or just passing ID. 
// Standard REST: GET /leads/:id/messages
router.get('/:leadId/messages', messageController.getMessages);
router.post('/:leadId/messages', messageController.sendMessage);
router.put('/:leadId/messages/read', messageController.markRead);

export default router;
