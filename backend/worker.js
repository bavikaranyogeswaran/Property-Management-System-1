/**
 * ============================================================================
 *  BACKGROUND WORKER ENTRY POINT
 * ============================================================================
 *  This process handles all automated tasks (Rent generation, Late fees, etc).
 *  It is isolated from the main API to ensure the tenant-facing website
 *  remains fast and responsive during heavy background processing.
 * ============================================================================
 */

import { Worker } from 'bullmq';
import { connection } from './config/queue.js';
import { registerRepeatableJobs } from './utils/cronJobs.js';
import { jobProcessor } from './queues/taskProcessor.js';
import { config, validateConfig } from './config/config.js';
import logger from './utils/logger.js';

// Validate Configuration on Startup (Fail Fast)
validateConfig();

logger.info('---------------------------------------------------------');
logger.info('PMS BACKGROUND WORKER: Initializing BullMQ...');
logger.info('---------------------------------------------------------');

/**
 * Initialize the Background Worker
 */
const initWorker = async () => {
  try {
    // 1. Initialize the BullMQ Worker
    const worker = new Worker('pms_background_tasks', jobProcessor, {
      connection,
      concurrency: 1, // High-integrity tasks should run sequentially per worker
    });

    worker.on('failed', (job, err) => {
      logger.error(`[Queue] FATAL Job ${job.id} failed:`, err);
    });

    logger.info('[Worker] BullMQ Processor is active and listening.');

    // 2. Register/Sync Recurring Schedules
    await registerRepeatableJobs();
    logger.info('[Worker] All background schedules are synchronized.');
  } catch (error) {
    logger.error('[Worker] Fatal Error during registration:', error);
    process.exit(1);
  }
};

// Start the worker
initWorker();

// Graceful Shutdown
process.on('SIGTERM', async () => {
  logger.info('[Worker] Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});
