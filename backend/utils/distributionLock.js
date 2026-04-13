import redis from '../config/redis.js';

/**
 * DistributionLock
 * Provides distributed mutual exclusion for sensitive operations.
 * Uses the Redlock-compatible SET NX EX pattern.
 */
export const runWithLock = async (lockName, ttlSeconds, taskFn) => {
  const lockKey = `lock:${lockName}`;
  const lockValue = Date.now().toString();

  try {
    // [HARDENED] Atomic acquisition
    const acquired = await redis.set(
      lockKey,
      lockValue,
      'NX',
      'EX',
      ttlSeconds
    );

    if (!acquired) {
      console.warn(
        `[Lock] Failed to acquire lock: ${lockName}. Resource is busy.`
      );
      return { success: false, reason: 'LOCKED' };
    }

    try {
      const result = await taskFn();
      return { success: true, result };
    } finally {
      // [HARDENED] Safe release via Lua script to ensure we only delete OUR lock
      const releaseScript = `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
            `;
      await redis.eval(releaseScript, 1, lockKey, lockValue);
    }
  } catch (err) {
    console.error(`[Lock] Execution error for ${lockName}:`, err.message);
    throw err;
  }
};

export default { runWithLock };
