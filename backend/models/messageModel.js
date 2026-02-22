import db from '../config/db.js';

class MessageModel {
  async create(leadId, senderId, content, senderType = 'user', senderLeadId = null) {
    if (senderType === 'lead') {
      const [result] = await db.query(
        'INSERT INTO messages (lead_id, sender_id, sender_lead_id, sender_type, content) VALUES (?, NULL, ?, ?, ?)',
        [leadId, senderLeadId, senderType, content]
      );
      return result.insertId;
    }
    
    const [result] = await db.query(
      'INSERT INTO messages (lead_id, sender_id, sender_type, content) VALUES (?, ?, ?, ?)',
      [leadId, senderId, senderType, content]
    );
    return result.insertId;
  }

  async findByLeadId(leadId) {
    const [rows] = await db.query(
      `
            SELECT 
                m.message_id as id,
                m.lead_id as leadId,
                m.sender_id as senderId,
                m.sender_lead_id as senderLeadId,
                m.sender_type as senderType,
                CASE WHEN m.sender_type = 'user' THEN u.name ELSE l.name END as senderName,
                CASE WHEN m.sender_type = 'user' THEN u.role ELSE 'lead' END as senderRole,
                m.content,
                m.is_read as isRead,
                m.created_at as createdAt
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.user_id
            LEFT JOIN leads l ON m.sender_lead_id = l.lead_id
            WHERE m.lead_id = ?
            ORDER BY m.created_at ASC
        `,
      [leadId]
    );
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
    // For lead-sent messages (sender_id IS NULL), they should also be marked read by the owner
    const [result] = await db.query(
      'UPDATE messages SET is_read = TRUE WHERE lead_id = ? AND (sender_id != ? OR sender_id IS NULL)',
      [leadId, readerId]
    );
    return result.affectedRows;
  }
}

export default new MessageModel();
