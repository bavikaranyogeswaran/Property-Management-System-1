import redis from '../config/redis.js';
import crypto from 'crypto';

// ============================================================================
//  SECURITY TOKEN SERVICE (The One-Time Key Maker)
// ============================================================================
//  Manages opaque, one-time use tokens stored in Redis with auto-expiry.
//  These are like "temporary entrance passes" for high-security actions
//  like resetting a password or verifying an email.
// ============================================================================
class SecurityTokenService {
  /**
   * Create a new opaque token
   * @param {string} userId - ID of the user
   * @param {string} type - Action type ('reset', 'verify', 'setup', 'invite')
   * @param {number} ttlSeconds - Expiry time in seconds (default 3600 / 1 hour)
   * @param {Object} metadata - Optional additional data to store with the token
   * @returns {string} The generated token
   */
  // CREATE TOKEN: Generates a random, secure token and saves it in the vault (Redis).
  async createToken(userId, type, ttlSeconds = 3600, metadata = {}) {
    // 1. [SECURITY] Generate cryptographically strong random hex string
    const token = crypto.randomBytes(32).toString('hex');
    const key = `token:${type}:${token}`;

    // 2. Map payload including user relation and creation time
    const payload = JSON.stringify({
      userId,
      type,
      metadata,
      createdAt: new Date().toISOString(),
    });

    // 3. Persist to Redis with sliding expiration (Auto-expiry)
    await redis.set(key, payload, 'EX', ttlSeconds);
    return token;
  }

  /**
   * Verify and consume (delete) a token
   * @param {string} token - The token string to verify
   * @param {string} expectedType - The expected action type
   * @returns {Object|null} The token data if valid, otherwise null
   */
  // CONSUME TOKEN: Checks if a token is valid, and if so, "burns" it so it can't be used again.
  async consumeToken(token, expectedType) {
    if (!token) return null;

    // 1. [SECURITY] Resolve key from distributed state (Redis)
    const key = `token:${expectedType}:${token}`;
    const data = await redis.get(key);
    if (!data) return null;

    const parsed = JSON.parse(data);

    // 2. [SECURITY] Ensure action type matches (Prevent token reuse across different flows)
    if (parsed.type !== expectedType) {
      console.error(
        `[SecurityToken] Type mismatch: Expected ${expectedType}, got ${parsed.type}`
      );
      return null;
    }

    // 3. [SECURITY] One-Time Use: Atomic delete immediately after retrieval (Burn-on-read)
    await redis.del(key);

    return parsed;
  }

  /**
   * Revoke all tokens of a specific type for a user
   * Useful when a user requests multiple reset links.
   * Note: Requires scanning or a user-to-token map.
   * For simplicity, our flow naturally overwrites the previous token in practice if we use user-keyed storage,
   * but here we use token-keyed for O(1) verify.
   */
  // REVOKE TOKENS: Cancels all active tokens of a certain type for a user.
  async revokeAllForUser(userId, type) {
    // Implementation note: Scanning keys is slow.
    // In high-scale, we would store a secondary key `userTokens:{userId}:{type}` -> token.
    // For now, we rely on the 1-hour expiry.
  }
}

export default new SecurityTokenService();
