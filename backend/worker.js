/**
 * ============================================================================
 *  BACKGROUND WORKER ENTRY POINT
 * ============================================================================
 *  This process handles all automated tasks (Rent generation, Late fees, etc).
 *  It is isolated from the main API to ensure the tenant-facing website
 *  remains fast and responsive during heavy background processing.
 * ============================================================================
 */

import { config, validateConfig } from './config/config.js';
import initCronJobs from './utils/cronJobs.js';
import logger from './utils/logger.js';

// Validate Configuration on Startup (Fail Fast)
validateConfig();

logger.info('---------------------------------------------------------');
logger.info('PMS BACKGROUND WORKER: Initializing...');
logger.info('---------------------------------------------------------');

// Start the scheduled tasks (The "Heartbeat" of the system)
try {
  initCronJobs();
  logger.info('[Worker] All scheduled tasks have been initialized.');
} catch (error) {
  logger.error('[Worker] Fatal Error during initialization:', error);
  process.exit(1);
}

// Keep the process alive
process.on('SIGTERM', () => {
  logger.info('[Worker] Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});
