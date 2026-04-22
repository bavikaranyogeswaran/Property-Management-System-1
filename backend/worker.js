process.env.TZ = 'Asia/Colombo';
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
import auditLogger from './utils/auditLogger.js';
import notificationModel from './models/notificationModel.js';
import userModel from './models/userModel.js';
import { ROLES } from './utils/roleUtils.js';
import http from 'http';

// --- HEALTH CHECK SERVER ---
// Since this worker runs in Docker, it needs to respond to health probes
// even though it doesn't serve a website.
const HEALTH_PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', service: 'pms-worker' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(HEALTH_PORT, () => {
    logger.info(
      `[Worker] Health check server listening on port ${HEALTH_PORT}`
    );
  });

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

    worker.on('failed', async (job, err) => {
      logger.error(
        `[Queue] FATAL Job ${job.id} failed after ${job.attemptsMade} attempts:`,
        err
      );

      try {
        const { name, data, id } = job;
        const details = {
          jobName: name,
          jobId: id,
          attempts: job.attemptsMade,
          errorMessage: err.message,
          data: data, // Useful for identifying the specific record (e.g., invoiceId)
        };

        // 1. Log a persistent Audit Entry for System Failure
        await auditLogger.log({
          userId: null, // System action
          actionType: 'BACKGROUND_TASK_FAILURE',
          entityId: data.invoiceId || data.leaseId || null,
          entityType: data.invoiceId
            ? 'invoice'
            : data.leaseId
              ? 'lease'
              : 'system',
          details,
        });

        // 2. Notify Assigned Staff (Treasurers & Owners)
        // We broadcast to all staff as background failures often indicate infra issues (SMTP, etc.)
        const treasurers = await userModel.findByRole(ROLES.TREASURER);
        const owners = await userModel.findByRole(ROLES.OWNER);
        const staffToNotify = [...treasurers, ...owners];

        for (const staff of staffToNotify) {
          await notificationModel.create({
            userId: staff.id,
            message: `URGENT: Background task [${name}] failed after ${job.attemptsMade} retries. Reason: ${err.message}`,
            type: 'system',
            severity: 'urgent',
            entityType: 'system',
            entityId: id,
          });
        }

        logger.info(
          `[Worker] Staff notification dispatched for failed job ${id}`
        );
      } catch (alertErr) {
        logger.error(
          '[Worker] Failed to dispatch staff alert for background failure:',
          alertErr
        );
      }
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
