import db from '../config/db.js';

class MessageModel {
  async create(data) {
    const { leadId = null, tenantId = null, senderId, content, senderType = 'user', senderLeadId = null } = data;

    if (senderType === 'lead') {
      const [result] = await db.query(
        'INSERT INTO messages (lead_id, tenant_id, sender_id, sender_lead_id, sender_type, content) VALUES (?, ?, NULL, ?, ?, ?)',
        [leadId, tenantId, senderLeadId, senderType, content]
      );
      return result.insertId;
    }
    
    const [result] = await db.query(
      'INSERT INTO messages (lead_id, tenant_id, sender_id, sender_type, content) VALUES (?, ?, ?, ?, ?)',
      [leadId, tenantId, senderId, senderType, content]
    );
    return result.insertId;
  }

  async findByLeadId(leadId) {
    const [rows] = await db.query(
      `
            SELECT 
                m.message_id as id,
                m.lead_id as leadId,
                m.tenant_id as tenantId,
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

  async findByTenantId(tenantId) {
    const [rows] = await db.query(
      `
            SELECT 
                m.message_id as id,
                m.tenant_id as tenantId,
                m.sender_id as senderId,
                m.sender_type as senderType,
                u.name as senderName,
                u.role as senderRole,
                m.content,
                m.is_read as isRead,
                m.created_at as createdAt
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.user_id
            WHERE m.tenant_id = ?
            ORDER BY m.created_at ASC
        `,
      [tenantId]
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
    const [result] = await db.query(
      'UPDATE messages SET is_read = TRUE WHERE lead_id = ? AND (sender_id != ? OR sender_id IS NULL)',
      [leadId, readerId]
    );
    return result.affectedRows;
  }

  async markAllAsReadForTenant(tenantId, readerId) {
    const [result] = await db.query(
      'UPDATE messages SET is_read = TRUE WHERE tenant_id = ? AND sender_id != ?',
      [tenantId, readerId]
    );
    return result.affectedRows;
  }
}

export default new MessageModel();
