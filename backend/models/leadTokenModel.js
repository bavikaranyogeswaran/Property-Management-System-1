import db from '../config/db.js';
import crypto from 'crypto';

class LeadTokenModel {
  /**
   * Create a new access token for a lead.
   * Token expires in 90 days by default.
   */
  async create(leadId, expiryDays = 90) {
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
   * Find a valid (non-expired) token record.
   * Returns { leadId, expiresAt } or null.
   */
  async findByToken(token) {
    const [rows] = await db.query(
      `SELECT lead_id AS leadId, expires_at AS expiresAt
       FROM lead_access_tokens
       WHERE token = ? AND expires_at > NOW()`,
      [token]
    );
    return rows[0] || null;
  }

  /**
   * Delete all tokens for a given lead (e.g. on conversion or drop).
   */
  async invalidateForLead(leadId, connection = null) {
    const dbConn = connection || db;
    await dbConn.query(
      'DELETE FROM lead_access_tokens WHERE lead_id = ?',
      [leadId]
    );
  }

  /**
   * Get active token for a lead (for re-sending portal link).
   */
  async findByLeadId(leadId) {
    const [rows] = await db.query(
      `SELECT token FROM lead_access_tokens
       WHERE lead_id = ? AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [leadId]
    );
    return rows[0]?.token || null;
  }
}

export default new LeadTokenModel();
