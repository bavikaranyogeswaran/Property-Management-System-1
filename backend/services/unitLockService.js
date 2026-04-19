// ============================================================================
//  UNIT LOCK SERVICE (The Booking Guard)
// ============================================================================
//  This service prevents "Double Booking" accidents.
//  It uses Redis to temporarily "hold" a unit while a tenant is checking out,
//  ensuring no two people try to pay for the same room at the same time.
// ============================================================================

import { connection as redis } from '../config/queue.js';

class UnitLockService {
  /**
   * Attempt to acquire a lock for a unit in Redis.
   * @param {string|number} unitId
   * @param {string|number} leadId
   * @returns {Promise<boolean>} True if lock acquired or already held by this lead
   */
  // ACQUIRE LOCK: Claims a unit for a specific Lead for 15 minutes.
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
  // IS LOCKED: Checks if someone else is currently in the middle of paying for this unit.
  async isLocked(unitId, excludeLeadId = null) {
    const id = unitId.toString();
    const lockKey = `unit_lock:${id}`;

    try {
      const currentValue = await redis.get(lockKey);

      // FAIL-CLOSED: If Redis returns a value, we know it's locked.
      if (!currentValue) return null;

      if (excludeLeadId && currentValue === excludeLeadId.toString()) {
        return null; // Locked by the caller, so it's "available" to them.
      }

      const ttl = await redis.ttl(lockKey);
      const expiresAt = new Date(Date.now() + (ttl > 0 ? ttl : 0) * 1000);

      return { leadId: currentValue, expiresAt };
    } catch (error) {
      console.error('UnitLockService Redis Error (check):', error);

      // [HARDENED] FAIL-CLOSED: If Redis is down, we must assume it IS locked
      // to prevent race conditions (Double Booking).
      return {
        leadId: 'SYSTEM_LOCK_ERROR',
        expiresAt: new Date(Date.now() + 60000), // Assume locked for 60s while system recovers
        error: 'Connection failure',
      };
    }
  }

  /**
   * Manually release a lock.
   * @param {string|number} unitId
   * @param {string|number} leadId (Optional) If provided, lock will only be released if it matches this lead.
   */
  async releaseLock(unitId, leadId = null) {
    const id = unitId.toString();
    const lockKey = `unit_lock:${id}`;
    const lid = leadId ? leadId.toString() : null;

    try {
      if (lid) {
        // Atomic ownership check via Lua script
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await redis.eval(script, 1, lockKey, lid);
      } else {
        // Fallback for system-level overrides or legacy calls
        await redis.del(lockKey);
      }
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
