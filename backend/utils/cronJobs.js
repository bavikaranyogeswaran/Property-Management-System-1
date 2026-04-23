// ============================================================================
//  CRON JOBS BARREL (S7 Decomposition)
// ============================================================================
//  This file now serves as a central entry point for all background jobs.
//  Logic has been moved to domain-specific files in utils/cron/ to improve
//  maintainability and reduce the size of the monolithic file.
// ============================================================================

import db from '../config/db.js';
import {
  today,
  now,
  formatToLocalDate,
  addDays,
  parseLocalDate,
} from './dateUtils.js';
import { runWithLock } from './distributionLock.js';
import { mainQueue, isQueueRedisReady } from '../config/queue.js';
import leaseService from '../services/leaseService.js';
import tenantModel from '../models/tenantModel.js';

// Import domain jobs for orchestration
import { generateRentInvoices, applyLateFees } from './cron/billingJobs.js';
import {
  checkLeaseExpiration,
  activateUpcomingLeases,
  syncUnitStatuses,
  expireDraftLeases,
  sendLeaseExpiryWarnings,
} from './cron/leaseJobs.js';
import {
  checkMaintenanceSLA,
  escalateOverdueMaintenance,
} from './cron/maintenanceJobs.js';
import {
  cleanupOldNotifications,
  expireStaleLeads,
  expireStaleRenewals,
  deactivateFormerTenants,
  autoAcknowledgeRefunds,
  sendRentReminders,
  sendVisitReminders,
  cleanupCloudinaryAsset,
  reconcileCloudinaryAssets,
} from './cron/cleanupJobs.js';
import { logCronExecution, extractPublicId } from './cron/cronHelpers.js';

// Re-export everything for taskProcessor and other consumers
export * from './cron/billingJobs.js';
export * from './cron/leaseJobs.js';
export * from './cron/maintenanceJobs.js';
export * from './cron/cleanupJobs.js';
export { logCronExecution, extractPublicId } from './cron/cronHelpers.js';

/**
 * Unified Nightly Cron Job (Locking + Backfill Support)
 */
export const runNightlyCron = async (targetDate = null) => {
  const executionDate = targetDate || today();
  console.log(`--- Starting Nightly Cron Activities for ${executionDate} ---`);

  try {
    // 1. Warnings & Expiries
    await sendLeaseExpiryWarnings();
    await checkLeaseExpiration();
    await activateUpcomingLeases();
    await leaseService.processAutomatedEscalations();

    // 2. Billing (Rent & Late Fees)
    await generateRentInvoices();
    await applyLateFees();

    // 3. Maintenance / Lead Expiries
    await syncUnitStatuses();
    await cleanupOldNotifications();
    await expireStaleLeads();
    await expireStaleRenewals();
    await expireDraftLeases();
    await deactivateFormerTenants(executionDate);
    await escalateOverdueMaintenance();

    // 4. Automated Health Checks (Healing Drifts)
    await tenantModel.recalculateAllBehaviorScores();
    await tenantModel.recalculateAllCreditBalances();

    // 5. Refund Operations
    await autoAcknowledgeRefunds();

    await logCronExecution('nightly_billing', executionDate, 'success');
  } catch (err) {
    await logCronExecution(
      'nightly_billing',
      executionDate,
      'failed',
      err.message
    );
    throw err;
  }
};

/**
 * Main Entry Point with Backfill Logic
 */
export const executeNightlyPayload = async () => {
  // [HARDENED] Distributed Lock ensures exactly one instance runs the billing payload.
  return await runWithLock('nightly_payload_run', 3600, async () => {
    const [lastRun] = await db.query(
      "SELECT last_success_date AS execution_date FROM cron_checkpoints WHERE job_name = 'nightly_billing' AND status = 'success' ORDER BY last_success_date DESC LIMIT 1"
    );

    const todayDate = parseLocalDate(today());
    let startDate;

    if (lastRun.length > 0) {
      startDate = addDays(lastRun[0].execution_date, 1);
    } else {
      startDate = todayDate;
    }

    // Backfill missed days up to today
    let current = startDate;
    while (current <= todayDate) {
      const dateStr = formatToLocalDate(current);
      try {
        await runNightlyCron(dateStr);
      } catch (err) {
        console.error(
          `[Queue] Nightly Cron failed for ${dateStr}:`,
          err.message
        );
        throw err;
      }
      current = addDays(current, 1);
    }
  });
};

/**
 * Registers repeatable jobs with the BullMQ scheduler.
 * Retries for a short period if Redis is still booting up (C6 fix for container race conditions).
 */
export const registerRepeatableJobs = async (retries = 10) => {
  if (!isQueueRedisReady) {
    if (retries > 0) {
      console.log(
        `[Queue] Redis not ready yet. Retrying job registration in 3s... (${retries} retries left)`
      );
      await new Promise((res) => setTimeout(res, 3000));
      return registerRepeatableJobs(retries - 1);
    }
    console.error(
      '[Queue] Redis is unavailable after multiple retries. Recurring jobs will NOT be registered.'
    );
    return;
  }

  console.log('[Queue] Registering repeatable background tasks...');

  // 1. Nightly Payload (1:00 AM)
  await mainQueue.add(
    'nightly_payload_task',
    {},
    {
      repeat: { pattern: '0 1 * * *' },
      jobId: 'nightly_payload',
    }
  );

  // 2. Asset Reconciliation (4:00 AM)
  await mainQueue.add(
    'reconcile_cloudinary_assets_task',
    {},
    {
      repeat: { pattern: '0 4 * * *' },
      jobId: 'reconcile_assets',
    }
  );

  // 3. Visit Reminders (7:00 AM)
  await mainQueue.add(
    'visit_reminders_task',
    {},
    { repeat: { pattern: '0 7 * * *' }, jobId: 'visit_reminders' }
  );

  // 4. Rent Reminders (8:00 AM)
  await mainQueue.add(
    'rent_reminders_task',
    {},
    { repeat: { pattern: '0 8 * * *' }, jobId: 'rent_reminders' }
  );

  // 5. Automated Refund Acknowledgement (2:00 AM)
  await mainQueue.add(
    'auto_acknowledge_refunds_task',
    {},
    { repeat: { pattern: '0 2 * * *' }, jobId: 'auto_ack_refunds' }
  );

  // 6. Maintenance SLA Monitoring (3:00 AM)
  await mainQueue.add(
    'maintenance_sla_task',
    {},
    { repeat: { pattern: '0 3 * * *' }, jobId: 'maintenance_sla' }
  );

  console.log('[Queue] All repeatable jobs have been synchronized.');
};
