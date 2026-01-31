import express from 'express';
import reportController from '../controllers/reportController.js';
import authenticateToken, { authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Only Owners and Treasurers can generate reports? 
// Or mainly Owner. Let's allow Owner and Treasurer.
router.get('/financial', authenticateToken, authorizeRoles('owner', 'treasurer'), reportController.generateFinancialReport);
router.get('/occupancy', authenticateToken, authorizeRoles('owner', 'treasurer'), reportController.generateOccupancyReport);

export default router;
