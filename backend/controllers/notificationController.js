// ============================================================================
//  NOTIFICATION CONTROLLER (The Alerts Center)
// ============================================================================
//  This file handles the personal "inbox" of system alerts.
//  It notifies users about payments, lease expirations, and maintenance updates.
// ============================================================================

import notificationModel from '../models/notificationModel.js';

class NotificationController {
  // GET NOTIFICATIONS: Lists all unread alerts for the logged-in user.
  async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const notifications = await notificationModel.findByUserId(userId);
      res.json(notifications);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  }

  // MARK AS READ: Clears a single notification.
  async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const success = await notificationModel.markAsRead(id);
      if (success) {
        res.json({ message: 'Notification marked as read' });
      } else {
        res.status(404).json({ error: 'Notification not found' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update notification' });
    }
  }

  // MARK ALL AS READ: Clears the entire notification inbox at once.
  async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;
      await notificationModel.markAllAsRead(userId);
      res.json({ message: 'All notifications marked as read' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update notifications' });
    }
  }

  async deleteNotification(req, res) {
    try {
      const { id } = req.params;
      const success = await notificationModel.deleteById(id, req.user.id);
      if (success) {
        res.json({ message: 'Notification deleted' });
      } else {
        res.status(404).json({ error: 'Notification not found' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete notification' });
    }
  }

  async clearRead(req, res) {
    try {
      const count = await notificationModel.deleteAllRead(req.user.id);
      res.json({ message: `Cleared ${count} read notifications` });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to clear notifications' });
    }
  }
}

export default new NotificationController();
