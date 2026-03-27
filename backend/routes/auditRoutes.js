import { Router } from 'express';
import auditController from '../controllers/auditController.js';
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, authorizeRoles('owner'), auditController.getLogs);

export default router;
