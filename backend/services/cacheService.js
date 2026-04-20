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
  // GET OR SET: Cache-Aside logic. Retrieves from memory or executes the database fetcher.
  async getOrSet(key, fetchFn, ttl = 3600) {
    try {
      // 1. [PERFORMANCE] Key Check: Attempt O(1) retrieval from distributed memory (Redis)
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached);

      // 2. Cache Miss: Execute the heavyweight fetch function (usually a DB query)
      const data = await fetchFn();

      // 3. Hydrate Cache: Save the result back to Redis with a TTL to ensure eventual consistency
      if (data !== undefined && data !== null) {
        await redis.set(key, JSON.stringify(data), 'EX', ttl);
      }
      return data;
    } catch (err) {
      console.error(`[CacheService] Error with key ${key}:`, err.message);
      // 4. FAIL-OPEN: If Redis is down, bypass the cache to ensure system availability
      return await fetchFn();
    }
  }

  /**
   * Invalidates a cache key
   * @param {string} key
   */
  // INVALIDATE: Purges a stale record from memory. Required after any database update (Mutation).
  async invalidate(key) {
    try {
      // 1. Force removal to ensure next 'getOrSet' fetches fresh data
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
