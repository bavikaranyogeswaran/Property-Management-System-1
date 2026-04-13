import { connection as redis } from '../config/queue.js';

class UnitLockService {
  /**
   * Attempt to acquire a lock for a unit in Redis.
   * @param {string|number} unitId
   * @param {string|number} leadId
   * @returns {Promise<boolean>} True if lock acquired or already held by this lead
   */
  async acquireLock(unitId, leadId) {
    const id = unitId.toString();
    const lid = leadId.toString();
    const lockKey = `unit_lock:${id}`;
    const ttlSeconds = 15 * 60; // 15 minute lock for checkout/conversion

    try {
      // SETNX (Set if Not Exists) with EX (Expiry)
      const result = await redis.set(lockKey, lid, 'EX', ttlSeconds, 'NX');

      if (result === 'OK') {
        return true;
      }

      // If already exists, check if it belongs to the same lead (refresh)
      const currentValue = await redis.get(lockKey);
      if (currentValue === lid) {
        await redis.expire(lockKey, ttlSeconds);
        return true;
      }

      return false;
    } catch (error) {
      console.error('UnitLockService Redis Error (acquire):', error);
      return false;
    }
  }

  /**
   * Check if a unit is locked by someone ELSE.
   */
  async isLocked(unitId, excludeLeadId = null) {
    const id = unitId.toString();
    const lockKey = `unit_lock:${id}`;

    try {
      const currentValue = await redis.get(lockKey);
      if (!currentValue) return null;

      if (excludeLeadId && currentValue === excludeLeadId.toString()) {
        return null;
      }

      const ttl = await redis.ttl(lockKey);
      const expiresAt = new Date(Date.now() + (ttl > 0 ? ttl : 0) * 1000);

      return { leadId: currentValue, expiresAt };
    } catch (error) {
      console.error('UnitLockService Redis Error (check):', error);
      return null;
    }
  }

  /**
   * Manually release a lock.
   */
  async releaseLock(unitId) {
    const id = unitId.toString();
    const lockKey = `unit_lock:${id}`;
    try {
      await redis.del(lockKey);
    } catch (error) {
      console.error('UnitLockService Redis Error (release):', error);
    }
  }

  /**
   * Background cleanup (No longer needed for Redis but kept for API compatibility)
   */
  async autoCleanup() {
    return;
  }
}

// Singleton instance
const unitLockService = new UnitLockService();

export default unitLockService;
