import express from 'express';
import reportController from '../controllers/reportController.js';
import { authenticateToken, authorizeRole } from '../controllers/authController.js';

const router = express.Router();

// Only Owners and Treasurers can generate reports? 
// Or mainly Owner. Let's allow Owner and Treasurer.
router.get('/financial', authenticateToken, authorizeRole(['owner', 'treasurer']), reportController.generateFinancialReport);
router.get('/occupancy', authenticateToken, authorizeRole(['owner', 'treasurer']), reportController.generateOccupancyReport);

export default router;
