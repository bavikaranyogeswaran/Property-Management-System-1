import { Router } from 'express';
import notificationController from '../controllers/notificationController.js';
import authenticateToken from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, notificationController.getNotifications);
router.put('/:id/read', authenticateToken, notificationController.markAsRead);
router.put('/read-all', authenticateToken, notificationController.markAllAsRead);

export default router;
