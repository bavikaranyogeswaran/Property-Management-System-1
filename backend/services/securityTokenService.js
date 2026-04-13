import redis from '../config/redis.js';
import crypto from 'crypto';

/**
 * SecurityTokenService
 * Manages opaque, one-time use tokens stored in Redis with auto-expiry.
 * Replaces stateless JWTs for high-integrity actions (Password Reset, Setup, Verification).
 */
class SecurityTokenService {
  /**
   * Create a new opaque token
   * @param {string} userId - ID of the user
   * @param {string} type - Action type ('reset', 'verify', 'setup', 'invite')
   * @param {number} ttlSeconds - Expiry time in seconds (default 3600 / 1 hour)
   * @param {Object} metadata - Optional additional data to store with the token
   * @returns {string} The generated token
   */
  async createToken(userId, type, ttlSeconds = 3600, metadata = {}) {
    const token = crypto.randomBytes(32).toString('hex');
    const key = `token:${type}:${token}`;

    const payload = JSON.stringify({
      userId,
      type,
      metadata,
      createdAt: new Date().toISOString(),
    });

    await redis.set(key, payload, 'EX', ttlSeconds);
    return token;
  }

  /**
   * Verify and consume (delete) a token
   * @param {string} token - The token string to verify
   * @param {string} expectedType - The expected action type
   * @returns {Object|null} The token data if valid, otherwise null
   */
  async consumeToken(token, expectedType) {
    if (!token) return null;

    const key = `token:${expectedType}:${token}`;
    const data = await redis.get(key);

    if (!data) return null;

    const parsed = JSON.parse(data);

    // Ensure type matches (extra safety)
    if (parsed.type !== expectedType) {
      console.error(
        `[SecurityToken] Type mismatch: Expected ${expectedType}, got ${parsed.type}`
      );
      return null;
    }

    // ONE-TIME USE: Delete immediately after retrieval
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
  async revokeAllForUser(userId, type) {
    // Implementation note: Scanning keys is slow.
    // In high-scale, we would store a secondary key `userTokens:{userId}:{type}` -> token.
    // For now, we rely on the 1-hour expiry.
  }
}

export default new SecurityTokenService();
