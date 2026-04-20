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
  // CREATE: Generates a new cryptographically signed JWT for guest portal access.
  async create(leadId) {
    // 1. [DELEGATION] Crypto Generation: Sign a token with a 30-day lifecycle
    const token = jwt.sign({ leadId }, JWT_SECRET, {
      expiresIn: `${TOKEN_EXPIRY_DAYS}d`,
    });

    // 2. [DATA] Persistence: Update the column (triggers rotation by overwriting any old token)
    await db.query('UPDATE leads SET portal_token = ? WHERE lead_id = ?', [
      token,
      leadId,
    ]);

    return token;
  }

  // FIND BY TOKEN: Validates a presented string against the signature and vault record.
  async findByToken(token) {
    if (!token) return null;

    let payload;
    try {
      // 1. [SECURITY] Stateless Verification: Check JWT signature and expiration
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return null;
    }

    const { leadId } = payload;

    // 2. [SECURITY] Revocation Check: Ensure the vault still contains THIS exact token (blocking old rotated versions)
    const [rows] = await db.query(
      'SELECT portal_token FROM leads WHERE lead_id = ? AND portal_token IS NOT NULL',
      [leadId]
    );

    if (!rows.length || rows[0].portal_token !== token) return null;

    return { leadId };
  }

  // INVALIDATE FOR LEAD: Revokes all portal access for a specific individual.
  async invalidateForLead(leadId, connection = null) {
    const dbConn = connection || db;
    // 1. [DATA] Purge Logic: NULLing the column instantly invalidates any distributed JWT
    await dbConn.query(
      'UPDATE leads SET portal_token = NULL WHERE lead_id = ?',
      [leadId]
    );
  }

  // FIND BY LEAD ID: Fetches an existing valid token for re-transmission without rotation.
  async findByLeadId(leadId) {
    // 1. [DATA] Resolution
    const [rows] = await db.query(
      'SELECT portal_token FROM leads WHERE lead_id = ? AND portal_token IS NOT NULL',
      [leadId]
    );

    const storedToken = rows[0]?.portal_token || null;
    if (!storedToken) return null;

    // 2. [SECURITY] Sanity Check: Ensure the stored string hasn't expired since it was issued
    try {
      jwt.verify(storedToken, JWT_SECRET);
      return storedToken;
    } catch {
      return null;
    }
  }
}

export default new LeadTokenModel();
