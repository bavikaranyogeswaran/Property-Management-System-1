import { Router } from 'express';
import notificationController from '../controllers/notificationController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, notificationController.getNotifications);
router.put('/:id/read', authenticateToken, notificationController.markAsRead);
router.put(
  '/read-all',
  authenticateToken,
  notificationController.markAllAsRead
);
router.delete('/read', authenticateToken, notificationController.clearRead);
router.delete('/:id', authenticateToken, notificationController.deleteNotification);

export default router;
