// ============================================================================
//  LEAD TOKEN MODEL (The Temporary Pass)
// ============================================================================
//  Manages one-time secure links for prospective tenants to view their status.
// ============================================================================

/**
 * leadTokenModel.js
 *
 * Manages portal access tokens for leads (unauthenticated guests).
 *
 * Architecture: tokens are signed JWTs stored directly in `leads.portal_token`.
 * - No separate table is needed (satisfies 3NF — portal_token depends only on lead_id).
 * - JWT encodes its own expiry (exp claim), so no portal_token_expires_at column is needed.
 * - Revocation is achieved by setting leads.portal_token = NULL.
 * - Verification requires BOTH a valid JWT signature/expiry AND that the stored token
 *   matches the presented token (prevents use of previously-rotated tokens).
 */

import db from '../config/db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY_DAYS = 30;

if (!JWT_SECRET) {
  throw new Error(
    '[leadTokenModel] JWT_SECRET environment variable is not set.'
  );
}

class LeadTokenModel {
  /**
   * Create a new portal access token for a lead.
   * Invalidates any existing token (rotation) by overwriting the column.
   *
   * @param {number} leadId
   * @returns {Promise<string>} The signed JWT string
   */
  async create(leadId) {
    const token = jwt.sign({ leadId }, JWT_SECRET, {
      expiresIn: `${TOKEN_EXPIRY_DAYS}d`,
    });

    await db.query('UPDATE leads SET portal_token = ? WHERE lead_id = ?', [
      token,
      leadId,
    ]);

    return token;
  }

  /**
   * Validate a portal token and return the associated lead context.
   *
   * Two-step verification:
   *  1. JWT signature + expiry (stateless)
   *  2. Stored token match (ensures revoked/rotated tokens are rejected)
   *
   * @param {string} token
   * @returns {Promise<{ leadId: number } | null>}
   */
  async findByToken(token) {
    if (!token) return null;

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      // Expired or tampered token
      return null;
    }

    const { leadId } = payload;

    // Revocation check: confirm stored token still matches
    const [rows] = await db.query(
      'SELECT portal_token FROM leads WHERE lead_id = ? AND portal_token IS NOT NULL',
      [leadId]
    );

    if (!rows.length || rows[0].portal_token !== token) {
      return null;
    }

    return { leadId };
  }

  /**
   * Revoke the active portal token for a lead by NULLing the column.
   * Preserves no audit trail (unlike the old is_revoked approach) — call this
   * only when the token is superseded (rotation) or the lead is closed/converted.
   *
   * @param {number} leadId
   * @param {import('mysql2').Connection | null} connection  Optional transaction connection
   */
  async invalidateForLead(leadId, connection = null) {
    const dbConn = connection || db;
    await dbConn.query(
      'UPDATE leads SET portal_token = NULL WHERE lead_id = ?',
      [leadId]
    );
  }

  /**
   * Get the active (non-expired) portal token for a lead, if one exists.
   * Used when re-sending a portal link without rotating the token.
   *
   * @param {number} leadId
   * @returns {Promise<string | null>}
   */
  async findByLeadId(leadId) {
    const [rows] = await db.query(
      'SELECT portal_token FROM leads WHERE lead_id = ? AND portal_token IS NOT NULL',
      [leadId]
    );

    const storedToken = rows[0]?.portal_token || null;
    if (!storedToken) return null;

    // Verify the stored token is still valid (not expired)
    try {
      jwt.verify(storedToken, JWT_SECRET);
      return storedToken;
    } catch {
      return null;
    }
  }
}

export default new LeadTokenModel();
