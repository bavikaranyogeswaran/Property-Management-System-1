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
      // 1. [SECURITY] Inbox Scoping: Ensure users only see notifications triggered for their specific account
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
      // 1. [DATA] Atomic state update: Dismiss a specific alert from the user's active view
      const success = await notificationModel.markAsRead(id);
      if (success) res.json({ message: 'Notification marked as read' });
      else res.status(404).json({ error: 'Notification not found' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update notification' });
    }
  }

  // MARK ALL AS READ: Clears the entire notification inbox at once.
  async markAllAsRead(req, res) {
    try {
      // 1. [DATA] Bulk status update for the current user's session
      const userId = req.user.id;
      await notificationModel.markAllAsRead(userId);
      res.json({ message: 'All notifications marked as read' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update notifications' });
    }
  }

  // DELETE NOTIFICATION: Permanently removes a notification record.
  async deleteNotification(req, res) {
    try {
      const { id } = req.params;
      // 1. [DATA] Purge record with owner verification
      const success = await notificationModel.deleteById(id, req.user.id);
      if (success) res.json({ message: 'Notification deleted' });
      else res.status(404).json({ error: 'Notification not found' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete notification' });
    }
  }

  // CLEAR READ: Removes all notifications already marked as read to declutter the database.
  async clearRead(req, res) {
    try {
      // 1. [DATA] Bulk purge of history
      const count = await notificationModel.deleteAllRead(req.user.id);
      res.json({ message: `Cleared ${count} read notifications` });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to clear notifications' });
    }
  }
}

export default new NotificationController();
