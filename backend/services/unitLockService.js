// ============================================================================
//  UNIT LOCK SERVICE (The Booking Guard)
// ============================================================================
//  This service prevents "Double Booking" accidents.
//  It uses Redis to temporarily "hold" a unit while a tenant is checking out,
//  ensuring no two people try to pay for the same room at the same time.
// ============================================================================

import { connection as redis } from '../config/queue.js';
import logger from '../utils/logger.js';

class UnitLockService {
  /**
   * Attempt to acquire a lock for a unit in Redis.
   * @param {string|number} unitId
   * @param {string|number} leadId
   * @returns {Promise<boolean>} True if lock acquired or already held by this lead
   */
  // ACQUIRE LOCK: Claims a unit for a specific Lead. Prevents "Double Booking" during the 15-minute checkout window.
  async acquireLock(unitId, leadId) {
    const lockKey = `unit_lock:${unitId}`;
    const ttlSeconds = 15 * 60;

    try {
      // 1. [CONCURRENCY] Atomic Claim: Set key only if not exists (NX) with auto-expiry (EX)
      const result = await redis.set(
        lockKey,
        leadId.toString(),
        'EX',
        ttlSeconds,
        'NX'
      );
      if (result === 'OK') return true;

      // 2. [CONCURRENCY] Refresh: If already held by the same lead, extend the timer
      const currentValue = await redis.get(lockKey);
      if (currentValue === leadId.toString()) {
        await redis.expire(lockKey, ttlSeconds);
        return true;
      }

      return false;
    } catch (err) {
      logger.error('Lock Acquisition Error:', { error: err.message });
      return false;
    }
  }

  // IS LOCKED: Checks if another user is currently in a checkout session for this unit.
  async isLocked(unitId, excludeLeadId = null) {
    const lockKey = `unit_lock:${unitId}`;

    try {
      // 1. [CONCURRENCY] Memory Probe: Check Redis for an active lock value
      const currentValue = await redis.get(lockKey);
      if (!currentValue) return null;

      // 2. Self-Exclusion: If the caller holds the lock, treat it as available
      if (excludeLeadId && currentValue === excludeLeadId.toString())
        return null;

      // 3. Resolve metadata for UI feedback (e.g., "Locked for 5 more minutes")
      const ttl = await redis.ttl(lockKey);
      return {
        leadId: currentValue,
        expiresAt: new Date(Date.now() + (ttl > 0 ? ttl : 0) * 1000),
      };
    } catch (err) {
      logger.error('Lock Check Error:', { error: err.message });
      // 4. [CONCURRENCY] Fail-Closed Guard: If Redis is unreachable, assume LOCKED to prevent race conditions
      return {
        leadId: 'SYSTEM_LOCK_ERROR',
        expiresAt: new Date(Date.now() + 60000),
        error: 'Connection failure',
      };
    }
  }

  // RELEASE LOCK: Manually surrenders a unit claim.
  async releaseLock(unitId, leadId = null) {
    const lockKey = `unit_lock:${unitId}`;

    try {
      if (leadId) {
        // 1. [SECURITY] Ownership-Verified Delete: Use Lua to atomically check leadId before deleting (Prevent stealing)
        const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
        await redis.eval(script, 1, lockKey, leadId.toString());
      } else {
        // 2. Force Purge: System-level override
        await redis.del(lockKey);
      }
    } catch (err) {
      logger.error('Lock Release Error:', { error: err.message });
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
