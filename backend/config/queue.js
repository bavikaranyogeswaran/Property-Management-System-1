import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { redisConfig } from './redis.js';
import logger from '../utils/logger.js';
import { config } from './config.js';

// Connection Configuration (Shared)
// BullMQ requires maxRetriesPerRequest: null
const connection = new IORedis({
  ...redisConfig,
  maxRetriesPerRequest: null,
  // Prevent ioredis from throwing unhandled errors when Redis is offline
  enableOfflineQueue: false,
  lazyConnect: true,
});

// Track connection state for graceful degradation
let isQueueRedisReady = false;

connection.on('connect', () => {
  isQueueRedisReady = true;
  logger.info('[Queue] Successfully connected to Redis.');
});

connection.on('error', (err) => {
  // Suppress log spam — only log meaningful state transitions
  if (isQueueRedisReady) {
    logger.error('[Queue] Redis connection lost:', err.message);
  }
  isQueueRedisReady = false;
});

connection.on('close', () => {
  isQueueRedisReady = false;
});

// Attempt a lazy connection — if it fails, everything still works, just without queues
connection.connect().catch((err) => {
  logger.warn(
    '[Queue] Redis is unavailable at startup. Background jobs will be skipped until Redis is available.',
    err.message
  );
});

/**
 * Main Background Queue
 */
export const mainQueue = new Queue('pms_background_tasks', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false, // Keep for debugging
  },
});

// Absorb queue-level errors so they don't become unhandled rejections
mainQueue.on('error', (err) => {
  logger.warn('[Queue] Queue error (non-fatal):', err.message);
});

export { connection, isQueueRedisReady };
