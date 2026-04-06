/**
 * ============================================================================
 *  BACKGROUND WORKER ENTRY POINT
 * ============================================================================
 *  This process handles all automated tasks (Rent generation, Late fees, etc).
 *  It is isolated from the main API to ensure the tenant-facing website
 *  remains fast and responsive during heavy background processing.
 * ============================================================================
 */

import 'dotenv/config';
import initCronJobs from './utils/cronJobs.js';

console.log('---------------------------------------------------------');
console.log('PMS BACKGROUND WORKER: Initializing...');
console.log(`Time: ${new Date().toISOString()}`);
console.log('---------------------------------------------------------');

// Start the scheduled tasks (The "Heartbeat" of the system)
try {
  initCronJobs();
  console.log('[Worker] All scheduled tasks have been initialized.');
} catch (error) {
  console.error('[Worker] Fatal Error during initialization:', error);
  process.exit(1);
}

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('[Worker] Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});
