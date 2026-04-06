import logger from '../utils/logger.js';
import * as jobs from '../utils/cronJobs.js';

/**
 * Task Mapping for BullMQ Processor
 * Maps job names to execution functions.
 */
const taskMap = {
  nightly_payload_task: jobs.executeNightlyPayload,
  visit_reminders_task: jobs.sendVisitReminders,
  rent_reminders_task: jobs.sendRentReminders,
};

/**
 * BullMQ Job Processor
 * Dispatches work to the correct job function based on the job name.
 */
export const jobProcessor = async (job) => {
  const { name, id } = job;
  const taskFn = taskMap[name];

  if (!taskFn) {
    logger.error(`[Queue] No task function mapped for job: ${name}`);
    return;
  }

  logger.info(`[Queue] INFO: Running job [${name}] (ID: ${id})`);

  try {
    const startTime = Date.now();
    await taskFn();
    const duration = Date.now() - startTime;
    logger.info(`[Queue] SUCCESS: Job [${name}] finished in ${duration}ms.`);
  } catch (error) {
    logger.error(`[Queue] FAILED: Job [${name}] error:`, error);
    // Throw error so BullMQ handles retries based on queue configuration
    throw error;
  }
};
