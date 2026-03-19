import express from 'express';
import documentController from '../controllers/documentController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = express.Router();

// Publicly reachable but internally protected
router.get('/view/:id', authenticateToken, documentController.viewDocument);

export default router;
