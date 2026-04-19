// ============================================================================
//  NOTIFICATION MODEL (The Alert Queue)
// ============================================================================
//  Stores system notifications sent to users.
// ============================================================================

import pool from '../config/db.js';

class NotificationModel {
  async create(data, connection = null) {
    const { userId, message, type, isRead, severity, entityType, entityId } =
      data;
    const db = connection || pool;
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

  async findByUserId(userId) {
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

  async markAsRead(notificationId) {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE notification_id = ?',
      [notificationId]
    );
    return result.affectedRows > 0;
  }

  async markAllAsRead(userId) {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ?',
      [userId]
    );
    return result.affectedRows > 0;
  }

  async deleteById(notificationId, userId) {
    const [result] = await pool.query(
      'DELETE FROM notifications WHERE notification_id = ? AND user_id = ?',
      [notificationId, userId]
    );
    return result.affectedRows > 0;
  }

  async deleteAllRead(userId) {
    const [result] = await pool.query(
      'DELETE FROM notifications WHERE user_id = ? AND is_read = TRUE',
      [userId]
    );
    return result.affectedRows;
  }

  async deleteOlderThan(days) {
    const [result] = await pool.query(
      'DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [days]
    );
    return result.affectedRows;
  }
}

export default new NotificationModel();
