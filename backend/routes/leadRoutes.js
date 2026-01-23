import express from 'express';
import leadController from '../controllers/leadController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = express.Router();

// Public route - Create Lead
router.post('/', leadController.createLead);

// Protected routes
router.use(authenticateToken);

router.get('/', leadController.getLeads);
router.put('/:id', leadController.updateLead);
router.post('/:id/convert', leadController.convertLead);

export default router;
