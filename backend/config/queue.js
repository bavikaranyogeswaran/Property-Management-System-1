import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config.js';
import logger from '../utils/logger.js';

// Connection Configuration (Shared)
const connection = new IORedis({
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null, // Required by BullMQ
});

connection.on('connect', () => {
  logger.info('[Queue] Successfully connected to Redis.');
});

connection.on('error', (err) => {
  logger.error('[Queue] Redis connection error:', err);
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

export { connection };
