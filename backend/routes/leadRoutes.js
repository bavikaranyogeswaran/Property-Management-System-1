import express from 'express';
import leadController from '../controllers/leadController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticateToken); // Protect all lead routes

router.get('/', leadController.getLeads);
router.post('/', leadController.createLead);
router.put('/:id', leadController.updateLead);
router.post('/:id/convert', leadController.convertLead);

export default router;
