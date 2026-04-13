import IORedis from 'ioredis';
import logger from '../utils/logger.js';

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

export default redis;
