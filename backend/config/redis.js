import IORedis from 'ioredis';
import logger from '../utils/logger.js';

// Ensure dotenv has been loaded before reading env vars
// (config.js calls dotenv.config() at import time)
import '../config/config.js';

const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

export const redisConfig = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  retryStrategy: (times) => {
    // Exponential backoff with a cap of 2 seconds
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  // Ensure the client doesn't hang the process if redis is down
  connectTimeout: 10000,
};

/**
 * Centralized Redis Client
 * Used for Caching, Rate Limiting, and Session Management.
 *
 * [HARDENED] Centralized connection management with automatic retries
 * and standardized logging.
 */
const redis = new IORedis(redisConfig);

redis.on('connect', () => {
  logger.info(`[Redis] Successfully connected to ${REDIS_HOST}:${REDIS_PORT}`);
});

redis.on('error', (err) => {
  logger.error('[Redis] Connection error:', err);
});

/**
 * [HARDENED] Distributed Locking Utilities
 */

/**
 * Attempt to acquire a distributed lock.
 * @param {string} key - The lock identifier
 * @param {number} ttlMs - Time-to-live in milliseconds
 * @returns {Promise<string|null>} - A unique token if acquired, null otherwise
 */
export const acquireLock = async (key, ttlMs = 30000) => {
  const token = randomUUID();
  // NX: Only set if not exists, PX: Set expiry in ms
  const result = await redis.set(key, token, 'NX', 'PX', ttlMs);
  return result === 'OK' ? token : null;
};

/**
 * Release a distributed lock safely.
 * @param {string} key - The lock identifier
 * @param {string} token - The unique token returned by acquireLock
 */
export const releaseLock = async (key, token) => {
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(luaScript, 1, key, token);
};

redis.acquireLock = acquireLock;
redis.releaseLock = releaseLock;

import { randomUUID } from 'crypto';
export default redis;
