import db from '../config/db.js';
import crypto from 'crypto';

class LeadTokenModel {
  /**
   * Create a new access token for a lead.
   * Token expires in 30 days by default.
   */
  async create(leadId, expiryDays = 30) {
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    await db.query(
      'INSERT INTO lead_access_tokens (lead_id, token, expires_at) VALUES (?, ?, ?)',
      [leadId, token, expiresAt]
    );

    return token;
  }

  /**
   * Find a valid (non-expired, non-revoked) token record.
   * Returns { leadId, expiresAt } or null.
   */
  async findByToken(token) {
    const [rows] = await db.query(
      `SELECT lead_id AS leadId, expires_at AS expiresAt
       FROM lead_access_tokens
       WHERE token = ? AND expires_at > NOW() AND is_revoked = FALSE`,
      [token]
    );
    return rows[0] || null;
  }

  /**
   * Soft-invalidate all tokens for a given lead.
   * Preserves audit trail compared to hard deletion (C15 fix).
   */
  async invalidateForLead(leadId, connection = null) {
    const dbConn = connection || db;
    await dbConn.query(
      'UPDATE lead_access_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE lead_id = ? AND is_revoked = FALSE',
      [leadId]
    );
  }

  /**
   * Get active token for a lead (for re-sending portal link).
   */
  async findByLeadId(leadId) {
    const [rows] = await db.query(
      `SELECT token FROM lead_access_tokens
       WHERE lead_id = ? AND expires_at > NOW() AND is_revoked = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [leadId]
    );
    return rows[0]?.token || null;
  }
}

export default new LeadTokenModel();
