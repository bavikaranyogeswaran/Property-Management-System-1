import pool from '../config/db.js';

class NotificationModel {
    async create(data) {
        const { userId, message, type, isRead } = data;
        const [result] = await pool.query(
            'INSERT INTO notifications (user_id, message, type, is_read) VALUES (?, ?, ?, ?)',
            [userId, message, type, isRead || false]
        );
        return result.insertId;
    }

    async findByUserId(userId) {
        const [rows] = await pool.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        return rows.map(row => ({
            id: row.notification_id.toString(),
            userId: row.user_id.toString(),
            message: row.message,
            type: row.type,
            isRead: row.is_read,
            createdAt: row.created_at
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
}

export default new NotificationModel();
