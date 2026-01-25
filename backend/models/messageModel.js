import db from '../config/db.js';

class MessageModel {
    async create(leadId, senderId, content) {
        const [result] = await db.query(
            'INSERT INTO messages (lead_id, sender_id, content) VALUES (?, ?, ?)',
            [leadId, senderId, content]
        );
        return result.insertId;
    }

    async findByLeadId(leadId) {
        const [rows] = await db.query(`
            SELECT 
                m.message_id as id,
                m.lead_id as leadId,
                m.sender_id as senderId,
                u.name as senderName,
                u.role as senderRole,
                m.content,
                m.is_read as isRead,
                m.created_at as createdAt
            FROM messages m
            JOIN users u ON m.sender_id = u.user_id
            WHERE m.lead_id = ?
            ORDER BY m.created_at ASC
        `, [leadId]);
        return rows;
    }

    async markAsRead(messageId) {
        const [result] = await db.query(
            'UPDATE messages SET is_read = TRUE WHERE message_id = ?',
            [messageId]
        );
        return result.affectedRows > 0;
    }

    async markAllAsRead(leadId, readerId) {
        // Mark all messages in this lead thread as read WHERE sender_id != readerId
        const [result] = await db.query(
            'UPDATE messages SET is_read = TRUE WHERE lead_id = ? AND sender_id != ?',
            [leadId, readerId]
        );
        return result.affectedRows;
    }
}

export default new MessageModel();
