// ============================================================================
//  MESSAGE MODEL (The Inbox)
// ============================================================================
//  Stores chat messages between staff and tenants/leads.
// ============================================================================

import db from '../config/db.js';

class MessageModel {
  // CREATE: Dispatches a new chat message into a lead or tenant thread.
  async create(data) {
    const {
      leadId = null,
      tenantId = null,
      senderId,
      content,
      senderType = 'user',
      senderLeadId = null,
    } = data;

    // 1. [DATA] Lead-Authored Persistence: Special handling for sender_lead_id polymorphism
    if (senderType === 'lead') {
      const [result] = await db.query(
        'INSERT INTO messages (lead_id, tenant_id, sender_id, sender_lead_id, sender_type, content) VALUES (?, ?, NULL, ?, ?, ?)',
        [leadId, tenantId, senderLeadId, senderType, content]
      );
      return result.insertId;
    }

    // 2. [DATA] Staff/Tenant Persistence
    const [result] = await db.query(
      'INSERT INTO messages (lead_id, tenant_id, sender_id, sender_type, content) VALUES (?, ?, ?, ?, ?)',
      [leadId, tenantId, senderId, senderType, content]
    );
    return result.insertId;
  }

  // FIND BY LEAD ID: Retrieves the full conversational history for a prospect.
  async findByLeadId(leadId) {
    // 1. [QUERY] Extraction: Resolves sender names dynamically across User-Staff and Lead tables
    const [rows] = await db.query(
      `SELECT 
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
            ORDER BY m.created_at ASC`,
      [leadId]
    );
    return rows;
  }

  // FIND BY TENANT ID: Fetches internal support threads for a current occupant.
  async findByTenantId(tenantId) {
    // 1. [QUERY] Filtered Retrieval: Specialized for authenticated User-to-Staff chat
    const [rows] = await db.query(
      `SELECT 
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
            ORDER BY m.created_at ASC`,
      [tenantId]
    );
    return rows;
  }

  // MARK AS READ: Acknowledges a specific message receipt.
  async markAsRead(messageId) {
    // 1. [DATA] State Persistence
    const [result] = await db.query(
      'UPDATE messages SET is_read = TRUE WHERE message_id = ?',
      [messageId]
    );
    return result.affectedRows > 0;
  }

  // MARK ALL AS READ: Clears unread counts for a prospect thread.
  async markAllAsRead(leadId, readerId) {
    // 1. [DATA] Bulk Update: Marks all incoming (non-self) messages as read
    const [result] = await db.query(
      'UPDATE messages SET is_read = TRUE WHERE lead_id = ? AND (sender_id != ? OR sender_id IS NULL)',
      [leadId, readerId]
    );
    return result.affectedRows;
  }

  // MARK ALL AS READ FOR TENANT: Clears unread counts for an occupant support thread.
  async markAllAsReadForTenant(tenantId, readerId) {
    // 1. [DATA] Bulk Update
    const [result] = await db.query(
      'UPDATE messages SET is_read = TRUE WHERE tenant_id = ? AND sender_id != ?',
      [tenantId, readerId]
    );
    return result.affectedRows;
  }
}

export default new MessageModel();
