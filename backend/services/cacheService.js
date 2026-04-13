import redis from '../config/redis.js';

/**
 * CacheService
 * Provides a standardized Cache-Aside implementation for the application.
 */
class CacheService {
  /**
   * Get data from cache or fetch and cache it
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data if cache miss
   * @param {number} ttl - Time to live in seconds (default 3600)
   */
  async getOrSet(key, fetchFn, ttl = 3600) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }

      const data = await fetchFn();
      if (data !== undefined && data !== null) {
        await redis.set(key, JSON.stringify(data), 'EX', ttl);
      }
      return data;
    } catch (err) {
      console.error(`[CacheService] Error with key ${key}:`, err.message);
      // FAIL-OPEN: If Redis fails, call the fetch function directly
      return await fetchFn();
    }
  }

  /**
   * Invalidates a cache key
   * @param {string} key
   */
  async invalidate(key) {
    try {
      await redis.del(key);
    } catch (err) {
      console.error(
        `[CacheService] Invalidation error for key ${key}:`,
        err.message
      );
    }
  }

  /**
   * Helper to generate standardized user cache keys
   */
  getUserKey(userId) {
    return `cache:user:${userId}`;
  }

  /**
   * Helper to generate standardized property cache keys
   */
  getPropertyKey(propertyId) {
    return `cache:property:${propertyId}`;
  }
}

export default new CacheService();
