// ============================================================================
//  NOTIFICATION MODEL (The Alert Queue)
// ============================================================================
//  Stores system notifications sent to users.
// ============================================================================

import pool from '../config/db.js';

class NotificationModel {
  // CREATE: Dispatches a new alert into a user's notification feed.
  async create(data, connection = null) {
    const { userId, message, type, isRead, severity, entityType, entityId } =
      data;
    const db = connection || pool;
    // 1. [DATA] Persistence: Insert the alert with severity and optional entity linking (e.g. specific Invoice ID)
    const [result] = await db.query(
      'INSERT INTO notifications (user_id, message, type, severity, is_read, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        userId,
        message,
        type,
        severity || 'info',
        isRead || false,
        entityType || null,
        entityId || null,
      ]
    );
    return result.insertId;
  }

  // FIND BY USER ID: Retrieves the inbox for a specific staff member or tenant.
  async findByUserId(userId) {
    // 1. [QUERY] Extraction: Sorting by most recent first
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map((row) => ({
      id: row.notification_id.toString(),
      userId: row.user_id.toString(),
      message: row.message,
      type: row.type,
      severity: row.severity,
      entityType: row.entity_type,
      entityId: row.entity_id,
      isRead: !!row.is_read,
      createdAt: row.created_at,
    }));
  }

  // MARK AS READ: Updates a single notification status.
  async markAsRead(notificationId) {
    // 1. [DATA] State Persistence
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE notification_id = ?',
      [notificationId]
    );
    return result.affectedRows > 0;
  }

  // MARK ALL AS READ: Clears all unread flags for a user's feed.
  async markAllAsRead(userId) {
    // 1. [DATA] Bulk Update
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ?',
      [userId]
    );
    return result.affectedRows > 0;
  }

  // DELETE BY ID: Removes a specific notification (with ownership verification).
  async deleteById(notificationId, userId) {
    // 1. [DATA] Cleanup
    const [result] = await pool.query(
      'DELETE FROM notifications WHERE notification_id = ? AND user_id = ?',
      [notificationId, userId]
    );
    return result.affectedRows > 0;
  }

  // DELETE ALL READ: Purges cleared alerts for a specific user to unclutter the feed.
  async deleteAllRead(userId) {
    // 1. [DATA] Selective Deletion
    const [result] = await pool.query(
      'DELETE FROM notifications WHERE user_id = ? AND is_read = TRUE',
      [userId]
    );
    return result.affectedRows;
  }

  // DELETE OLDER THAN: Maintenance utility to prevent the notification table from bloating.
  async deleteOlderThan(days) {
    // 1. [DATA] TTL Cleanup: Removes all alerts older than the specified interval
    const [result] = await pool.query(
      'DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [days]
    );
    return result.affectedRows;
  }
}

export default new NotificationModel();
