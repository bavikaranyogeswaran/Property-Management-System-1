import cron from 'node-cron';
import db from '../config/db.js';
import leaseModel from '../models/leaseModel.js';
import invoiceModel from '../models/invoiceModel.js';
import notificationModel from '../models/notificationModel.js';
import emailService from './emailService.js';
import tenantModel from '../models/tenantModel.js';
import billingEngine from './billingEngine.js';
import paymentService from '../services/paymentService.js';
import leaseService from '../services/leaseService.js';
import { getCurrentDateString, getLocalTime, today, now, parseLocalDate, addDays, formatToLocalDate } from './dateUtils.js';
import { moneyMath, fromCents } from './moneyUtils.js';

// --- CONFIGURATION ---
const LATE_FEE_PERCENTAGE = 0.03;

/**
 * In-Memory Mutex Lock for Cron Jobs (Coding Level)
 */
const activeLocks = new Set();

const runWithLock = async (jobName, taskFn) => {
  if (activeLocks.has(jobName)) {
    console.warn(`[Cron] Job "${jobName}" is already locked (in-memory). Aborting.`);
    return;
  }

  activeLocks.add(jobName);
  console.log(`[Cron] Locked job: ${jobName} (in-memory)`);
  
  try {
    await taskFn();
  } catch (err) {
    console.error(`[Cron] Error in locked job "${jobName}":`, err);
  } finally {
    activeLocks.delete(jobName);
    console.log(`[Cron] Unlocked job: ${jobName} (in-memory)`);
  }
};

/**
 * [B5 FIX] Write checkpoint to cron_checkpoints table (UPSERT — one row per job)
 */
const logCronExecution = async (jobName, executionDate, status, message = null) => {
  try {
    await db.query(
      `INSERT INTO cron_checkpoints (job_name, last_success_date, status, message) 
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE last_success_date = VALUES(last_success_date), status = VALUES(status), message = VALUES(message)`,
      [jobName, executionDate, status, message]
    );
  } catch (err) {
    console.error('[Cron] Failed to write checkpoint:', err);
  }
};

export const generateRentInvoices = async () => {
  console.log('Running automated rent invoicing...');
  const currentToday = now();

  const currentYear = currentToday.getFullYear();
  const currentMonth = currentToday.getMonth() + 1; // 1-12

  try {
    const activeLeases = await leaseModel.findActive();
    console.log(`Found ${activeLeases.length} active leases.`);

    let createdCount = 0;
    for (const lease of activeLeases) {
      const adjustments = await leaseModel.getAdjustments(lease.id);
      const leaseRentInfo = billingEngine.calculateMonthlyRent(lease, currentYear, currentMonth, adjustments);

      if (!leaseRentInfo) continue;
      const dueDateStr = leaseRentInfo.dueDate;

      const exists = await invoiceModel.exists(
        lease.id,
        currentYear,
        currentMonth,
        'rent'
      );
      if (!exists) {
        console.log(
          `Creating invoice for Lease ${lease.id} (Unit ${lease.unitNumber})...`
        );
        const invoiceId = await invoiceModel.create({
          leaseId: lease.id,
          amount: leaseRentInfo.amount,
          dueDate: leaseRentInfo.dueDate,
          description: leaseRentInfo.description,
          type: 'rent',
        });

        if (!invoiceId) {
          continue;
        }

        // Auto-apply credit if exists
        try {
          await paymentService.applyTenantCredit(invoiceId);
        } catch (err) {
          console.error(`[Cron] Failed to auto-apply credit to generated rent invoice ${invoiceId}:`, err);
        }

        await notificationModel.create({
          userId: lease.tenantId,
          message: `A new rent invoice for ${currentYear}-${currentMonth} has been generated. Due date: ${dueDateStr}`,
          type: 'invoice',
          isRead: false,
        });


        // Send Email
        try {
          const [userRows] = await db.query(
            'SELECT email FROM users WHERE user_id = ?',
            [lease.tenantId]
          );
          if (userRows.length > 0) {
            await emailService.sendInvoiceNotification(userRows[0].email, {
              amount: fromCents(leaseRentInfo.amount),
              dueDate: dueDateStr,
              month: currentMonth,
              year: currentYear,
              invoiceId: invoiceId,
            });
          }
        } catch (emailErr) {
          console.error('Failed to send invoice email:', emailErr);
        }

        createdCount++;
      }
    }
    console.log(`Automated Invoicing: Created ${createdCount} new invoices.`);
  } catch (error) {
    console.error('Error in automated invoicing:', error);
  }
};

export const checkLeaseExpiration = async () => {
  console.log('Running lease expiration check...');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const currentToday = today();

    // 1. Find active leases past end date
    const [expiredLeases] = await connection.query(
      `
            SELECT l.lease_id, l.unit_id, p.owner_id 
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            WHERE l.status = 'active' AND l.end_date < ?
        `,
      [currentToday]
    );

    if (expiredLeases.length > 0) {
      console.log(`Found ${expiredLeases.length} expired leases.`);

      for (const lease of expiredLeases) {
        // Update Lease to 'expired' (System Auto-Expiry)
        await connection.query(
          "UPDATE leases SET status = 'expired' WHERE lease_id = ?",
          [lease.lease_id]
        );

        // [C2 FIX - Problem 1] Check for active successor lease (renewal) before setting maintenance
        const [successorLeases] = await connection.query(
          "SELECT lease_id FROM leases WHERE unit_id = ? AND status = 'active' AND lease_id != ?",
          [lease.unit_id, lease.lease_id]
        );

        if (successorLeases.length > 0) {
          // Renewal already active — unit stays 'occupied', no maintenance turnover
          console.log(
            `Lease ${lease.lease_id} expired but Unit ${lease.unit_id} has active successor lease. Skipping maintenance.`
          );
        } else {
          // No successor — unit goes to 'maintenance' (Turnover Buffer)
          await connection.query(
            "UPDATE units SET status = 'maintenance' WHERE unit_id = ?",
            [lease.unit_id]
          );
          console.log(
            `Lease ${lease.lease_id} is now EXPIRED. Unit ${lease.unit_id} set to Maintenance (Turnover).`
          );
        }

        // Notify Owner
        if (lease.owner_id) {
          await notificationModel.create({
            userId: lease.owner_id,
            message: `Lease for Unit ${lease.unit_id} has EXPIRED. Unit is now in Maintenance for turnover. Please process checkout.`,
            type: 'lease',
            severity: 'info',
          });
        }

        // Notify Treasurers (Refund Alert)
        const treasurers = await db
          .query("SELECT user_id FROM users WHERE role = 'treasurer'")
          .then(([rows]) => rows);
        for (const t of treasurers) {
          await notificationModel.create({
            userId: t.user_id,
            message: `Lease #${lease.lease_id} has EXPIRED. Please prepare for Security Deposit Refund.`,
            type: 'lease',
            severity: 'warning',
          });
        }
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error('Error in lease expiration check:', error);
  } finally {
    connection.release();
  }
};

// Expiry Warning (Daily at 0:30 AM)
export const sendLeaseExpiryWarnings = async () => {
  console.log('Running lease expiry warning check...');
  // Warn at 30 and 60 days
  const currentToday = now();
  
  const dateStr30 = formatToLocalDate(addDays(currentToday, 30));
  const dateStr60 = formatToLocalDate(addDays(currentToday, 60));

  try {
    // Find leases expiring exactly in 30 or 60 days
    const [expiringLeases] = await db.query(
      `
            SELECT l.*, t.email as tenant_email, u_owner.email as owner_email, p.name as property_name, un.unit_number
            FROM leases l
            JOIN users t ON l.tenant_id = t.user_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN properties p ON un.property_id = p.property_id
            LEFT JOIN users u_owner ON p.owner_id = u_owner.user_id
            WHERE l.status = 'active'
            AND l.end_date IN (?, ?)
        `,
      [dateStr30, dateStr60]
    );

    if (expiringLeases.length > 0) {
      console.log(
        `Found ${expiringLeases.length} leases expiring soon. Sending warnings...`
      );
      for (const lease of expiringLeases) {
        const daysCount = lease.end_date === dateStr30 ? 30 : 60;
        
        // 1. Notify Tenant
        await notificationModel.create({
          userId: lease.tenant_id,
          message: `Your lease is expiring in ${daysCount} days (on ${lease.end_date}). Please contact us if you wish to renew.`,
          type: 'system',
          severity: 'warning',
        });

        // 1b. Email Tenant
        if (lease.tenant_email) {
            await emailService.sendLeaseExpiryReminder(lease.tenant_email, {
                daysCount,
                endDate: lease.end_date,
                propertyName: lease.property_name,
                unitNumber: lease.unit_number,
                role: 'tenant'
            });
        }

        // 2. Notify Owner
        if (lease.owner_id) {
          await notificationModel.create({
            userId: lease.owner_id,
            message: `Lease for Unit ${lease.unit_number} is expiring in ${daysCount} days (on ${lease.end_date}).`,
            type: 'system',
            severity: 'warning',
          });

          // 2b. Email Owner
          if (lease.owner_email) {
              await emailService.sendLeaseExpiryReminder(lease.owner_email, {
                  daysCount,
                  endDate: lease.end_date,
                  propertyName: lease.property_name,
                  unitNumber: lease.unit_number,
                  role: 'owner'
              });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error sending expiry warnings:', error);
  }
};

// Late Fee Automation (Daily at 2:00 AM)
export const applyLateFees = async () => {
  console.log('Running late fee automation...');
  const todayStr = formatToLocalDate(now());
  
  try {
    const overdueInvoices = await invoiceModel.findOverdue();
    console.log(
      `Found ${overdueInvoices.length} overdue invoices eligible for late fee checks.`
    );

    let appliedCount = 0;
    for (const inv of overdueInvoices) {
      const isDaily = inv.lateFeeType === 'daily_fixed';
      
      if (isDaily) {
        // DAILY ACCRUAL LOGIC
        // Check if a late fee for "Today" already exists for this specific base invoice
        const [todayFeeExists] = await db.query(
          "SELECT 1 FROM rent_invoices WHERE lease_id = ? AND description LIKE ? AND invoice_type = 'late_fee' AND DATE(created_at) = CURDATE() LIMIT 1",
          [inv.lease_id, `%Daily Late Fee for ${todayStr}%Invoice #${inv.invoice_id}%`]
        );

        if (todayFeeExists.length > 0) {
          console.log(`Daily fee already applied for Invoice #${inv.invoice_id} on ${todayStr}. Skipping.`);
          continue;
        }

        const dailyAmount = inv.lateFeeAmount || 0;
        if (dailyAmount <= 0) continue;

        // Create Daily Late Fee Invoice
        const lateFeeInvoiceId = await invoiceModel.createLateFeeInvoice({
          leaseId: inv.lease_id,
          amount: dailyAmount,
          dueDate: formatToLocalDate(addDays(now(), 1)), // Due tomorrow
          description: `Daily Late Fee for ${todayStr} (Invoice #${inv.invoice_id})`,
        });

        if (lateFeeInvoiceId) {
          await paymentService.applyTenantCredit(lateFeeInvoiceId);
          appliedCount++;
        }

      } else {
        // FLAT PERCENTAGE LOGIC (Once every 30 days)
        const [feeExists] = await db.query(
          "SELECT 1 FROM rent_invoices WHERE lease_id = ? AND description LIKE ? AND invoice_type = 'late_fee' AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY) LIMIT 1",
          [inv.lease_id, `%Late Fee for Invoice #${inv.invoice_id}%`]
        );

        if (feeExists.length > 0) {
          console.log(`Flat late fee already exists for Invoice #${inv.invoice_id} in last 30 days. Skipping.`);
          continue;
        }

        const feePercentage = inv.lateFeePercentage !== null ? (inv.lateFeePercentage / 100) : LATE_FEE_PERCENTAGE;
        const flatFeeAmount = moneyMath(inv.amount).mul(feePercentage).round().value();

        const lateFeeInvoiceId = await invoiceModel.createLateFeeInvoice({
          leaseId: inv.lease_id,
          amount: flatFeeAmount,
          dueDate: formatToLocalDate(addDays(now(), 5)),
          description: `Late Fee for Invoice #${inv.invoice_id} (${inv.year}-${inv.month})`,
        });

        if (lateFeeInvoiceId) {
          await paymentService.applyTenantCredit(lateFeeInvoiceId);
          appliedCount++;
        }
      }

      // SHARED POST-APPLICATION LOGIC (Notifications & Score)
      // Only runs if a fee was actually applied in this loop
      const lastAppliedFee = await db.query(
        "SELECT amount, invoice_id FROM rent_invoices WHERE lease_id = ? AND invoice_type = 'late_fee' ORDER BY created_at DESC LIMIT 1",
        [inv.lease_id]
      ).then(([rows]) => rows[0]);

      if (lastAppliedFee) {
        // Notify Tenant
        await notificationModel.create({
          userId: inv.tenant_id,
          message: `A ${isDaily ? 'daily ' : ''}late fee of LKR ${fromCents(lastAppliedFee.amount).toFixed(2)} has been applied to your account for overdue invoice #${inv.invoice_id}.`,
          type: 'invoice',
          isRead: false,
        });

        // Log Behavior (Negative Score - only on the FIRST application to avoid crushing their score daily?)
        // Decision: Only log score change on the very first late fee for an invoice.
        const [firstFee] = await db.query(
          "SELECT 1 FROM rent_invoices WHERE lease_id = ? AND description LIKE ? AND invoice_type = 'late_fee' LIMIT 2",
          [inv.lease_id, `%Invoice #${inv.invoice_id}%`]
        );

        if (firstFee.length === 1) { // This is the first one
          try {
            const behaviorLogModel = (await import('../models/behaviorLogModel.js')).default;
            await behaviorLogModel.create({
                tenantId: inv.tenant_id,
                type: 'negative',
                category: 'Payment',
                scoreChange: -10,
                description: `Initial late payment penalty for Invoice #${inv.invoice_id}`,
                recordedBy: null
            });
            await tenantModel.incrementBehaviorScore(inv.tenant_id, -10);
          } catch (scoreErr) {
            console.error('Failed to log negative behavior:', scoreErr);
          }
        }

        // Logic Check: Mark Original Invoice as 'overdue' if it's still 'pending'
        if (inv.status === 'pending') {
          await invoiceModel.updateStatus(inv.invoice_id, 'overdue');
        }
      }
    }
    console.log(`Finished checking late fees. Applied ${appliedCount} new fees.`);
  } catch (error) {
    console.error('Error in late fee automation:', error);
  }
};

// Unit Status Sync (Daily at 3:00 AM)
// Fixes the "Gap Period" & "Reserved Black Hole" bugs:
// Reconciles units with their logical lease-based states (Occupied/Reserved/Available).
export const syncUnitStatuses = async () => {
  console.log('Running unit status synchronization...');
  try {
    const currentToday = today();

    // STAGE 1: FORCE 'occupied' for units with active leases today
    // Handles Available/Reserved/Maintenance -> Occupied transitions.
    const [shouldBeOccupied] = await db.query(
      `
      SELECT DISTINCT u.unit_id 
      FROM units u
      JOIN leases l ON u.unit_id = l.unit_id
      WHERE u.status IN ('available', 'reserved', 'maintenance', 'inactive')
      AND l.status = 'active'
      AND l.start_date <= ?
      AND (l.end_date IS NULL OR l.end_date >= ?)
      AND u.is_archived = FALSE
      `,
      [currentToday, currentToday]
    );

    if (shouldBeOccupied.length > 0) {
      console.log(`[Sync] Found ${shouldBeOccupied.length} units that should be 'occupied'. Syncing...`);
      const ids = shouldBeOccupied.map(u => u.unit_id);
      await db.query(`UPDATE units SET status = 'occupied' WHERE unit_id IN (?)`, [ids]);
    }

    // STAGE 2: FORCE 'reserved' for units with future claims (no active lease today)
    // Handles Available/Occupied -> Reserved transitions (e.g., ghost occupied cleanup or future booking).
    const [shouldBeReserved] = await db.query(
      `
      SELECT DISTINCT u.unit_id 
      FROM units u
      WHERE u.status IN ('available', 'occupied')
      AND u.is_archived = FALSE
      AND EXISTS (
          SELECT 1 FROM leases l 
          WHERE l.unit_id = u.unit_id 
          AND l.status IN ('active', 'draft', 'pending')
          AND l.start_date > ?
      )
      AND NOT EXISTS (
          SELECT 1 FROM leases l2 
          WHERE l2.unit_id = u.unit_id 
          AND l2.status = 'active'
          AND l2.start_date <= ?
          AND (l2.end_date IS NULL OR l2.end_date >= ?)
      )
      `,
      [currentToday, currentToday, currentToday]
    );

    if (shouldBeReserved.length > 0) {
      console.log(`[Sync] Found ${shouldBeReserved.length} units with future claims that should be 'reserved'. Syncing...`);
      const ids = shouldBeReserved.map(u => u.unit_id);
      await db.query(`UPDATE units SET status = 'reserved' WHERE unit_id IN (?)`, [ids]);
    }

    // STAGE 3: FORCE 'available' for units with NO valid claims (current or future)
    // Handles Reserved/Occupied -> Available transitions (Ghost Cleanup).
    // Note: 'maintenance' is deliberately skipped here as it's a manually set status.
    const [shouldBeAvailable] = await db.query(
      `
      SELECT DISTINCT u.unit_id 
      FROM units u
      WHERE u.status IN ('occupied', 'reserved')
      AND u.is_archived = FALSE
      AND NOT EXISTS (
          SELECT 1 FROM leases l 
          WHERE l.unit_id = u.unit_id 
          AND l.status IN ('active', 'draft', 'pending')
          AND (l.start_date <= ? OR l.start_date > ?)
          AND (l.end_date IS NULL OR l.end_date >= ?)
          AND l.status != 'cancelled' AND l.status != 'expired' AND l.status != 'terminated'
      )
      `,
      [currentToday, currentToday, currentToday]
    );

    if (shouldBeAvailable.length > 0) {
        console.log(`[Sync] Found ${shouldBeAvailable.length} units with NO valid claims that should be 'available'. Syncing...`);
        const ids = shouldBeAvailable.map(u => u.unit_id);
        await db.query(`UPDATE units SET status = 'available' WHERE unit_id IN (?)`, [ids]);
    }
  } catch (error) {
    console.error('Error syncing unit statuses:', error);
  }
};

// Rent Reminder (Daily at 8:00 AM)
export const sendRentReminders = async () => {
  const currentToday = now();
  const targetDay = billingEngine.RENT_DUE_DAY - 3;
  
  if (currentToday.getDate() !== targetDay) return;

  console.log('Running automated rent reminders...');
  try {
    const activeLeases = await leaseModel.findActive();
    const dueDate = `${currentToday.getFullYear()}-${String(currentToday.getMonth() + 1).padStart(2, '0')}-${String(billingEngine.RENT_DUE_DAY).padStart(2, '0')}`;

    for (const lease of activeLeases) {
        // Fetch tenant email
        const [userRows] = await db.query('SELECT email FROM users WHERE user_id = ?', [lease.tenantId]);
        if (userRows.length > 0 && userRows[0].email) {
            await emailService.sendRentReminder(userRows[0].email, {
                amount: fromCents(lease.monthlyRent),
                dueDate: dueDate,
                daysLeft: 3
            });
        }
    }
  } catch (error) {
    console.error('Error in automated rent reminders:', error);
  }
};

// Notification Cleanup (Daily at 4:00 AM)
// Prevents unbounded growth of the notifications table
export const cleanupOldNotifications = async () => {
  console.log('Running notification cleanup...');
  try {
    const notificationModel = (await import('../models/notificationModel.js')).default;

    // Delete read notifications older than 30 days
    const readDeleted = await notificationModel.deleteOlderThan(30);
    console.log(`Cleaned up ${readDeleted} notifications older than 30 days.`);
  } catch (error) {
    console.error('Error in notification cleanup:', error);
  }
};

// Stale Lead Auto-Expiry (Daily at 4:30 AM)
// Drops leads that have been 'interested' for 90+ days with no activity
export const expireStaleLeads = async () => {
  console.log('Running stale lead expiry...');
  try {
    const leadModel = (await import('../models/leadModel.js')).default;
    const count = await leadModel.expireStaleLeads(90);
    console.log(`Expired ${count} stale leads.`);
  } catch (error) {
    console.error('Error expiring stale leads:', error);
  }
};

// Visit Reminders (Daily at 7:00 AM)
// Sends 24h reminder emails to visitors with upcoming visits
export const sendVisitReminders = async () => {
  console.log('Running visit reminders...');
  try {
    const visitModel = (await import('../models/visitModel.js')).default;
    const upcoming = await visitModel.findUpcoming(24);

    for (const visit of upcoming) {
      try {
        if (visit.visitor_email) {
          await emailService.sendVisitReminder(visit.visitor_email, {
            visitorName: visit.visitor_name,
            propertyName: visit.property_name,
            unitNumber: visit.unit_number,
            scheduledDate: visit.scheduled_date,
          });
        }
      } catch (emailErr) {
        console.error(`Failed to send visit reminder for visit ${visit.visit_id}:`, emailErr);
      }
    }
    console.log(`Sent ${upcoming.length} visit reminders.`);
  } catch (error) {
    console.error('Error in visit reminders:', error);
  }
};

export const expireStaleRenewals = async () => {
  console.log('Running stale renewal request cleanup...');
  try {
    const cutoffDate = addDays(now(), -14);

    const [result] = await db.query(
      `UPDATE renewal_requests 
       SET status = 'expired' 
       WHERE status IN ('pending', 'negotiating') 
       AND created_at < ?`,
      [cutoffDate]
    );

    if (result.affectedRows > 0) {
      console.log(`Expired ${result.affectedRows} stale renewal requests.`);
    }
  } catch (error) {
    console.error('Error expiring stale renewal requests:', error);
  }
};

/**
 * Hardening Flow #1: Automatically expire draft leases that have been idle
 * for > 48 hours without a pending or verified deposit payment.
 */
export const expireDraftLeases = async () => {
  console.log('Running draft lease expiry check...');
  try {
    // [FIXED] Use the hardened reservation_expires_at deadline
    const [staleDrafts] = await db.query(
      `
      SELECT l.lease_id, l.unit_id 
      FROM leases l
      WHERE l.status = 'draft' 
      AND l.reservation_expires_at IS NOT NULL
      AND l.reservation_expires_at < ?
      `,
      [now()]
    );

    if (staleDrafts.length > 0) {
      console.log(`Found ${staleDrafts.length} stale draft leases. Expiring...`);
      const ids = staleDrafts.map(l => l.lease_id);
      
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        
        // Cancel the leases
        await connection.query(
          "UPDATE leases SET status = 'cancelled' WHERE lease_id IN (?)",
          [ids]
        );
        
        // [NEW] Return unit status to 'available' only if it was 'reserved' and no other active/draft leases exist.
        const uniqueUnitIds = [...new Set(staleDrafts.map(l => l.unit_id))];
        for (const unitId of uniqueUnitIds) {
            const [otherClaims] = await connection.query(
                "SELECT lease_id FROM leases WHERE unit_id = ? AND status IN ('active', 'draft', 'pending')",
                [unitId]
            );
            if (otherClaims.length === 0) {
                // Important: Only revert if the unit is currently 'reserved'. 
                // If it's already 'maintenance' or 'occupied' by another workflow, don't overwrite it.
                await connection.query(
                    "UPDATE units SET status = 'available' WHERE unit_id = ? AND status = 'reserved'", 
                    [unitId]
                );
            }
        }
        
        // Void their pending security deposit invoices
        for (const leaseId of ids) {
           await invoiceModel.voidPendingByLeaseId(leaseId, connection);
        }
        
        await connection.commit();
        console.log(`Successfully expired ${staleDrafts.length} draft leases.`);
      } catch (innerErr) {
        await connection.rollback();
        throw innerErr;
      } finally {
        connection.release();
      }
    }
  } catch (error) {
    console.error('Error expiring stale draft leases:', error);
  }
};
/**
 * Audit #9: Automatically revoke portal access for former tenants.
 * Deactivates accounts based on property-specific deactivation periods,
 * provided they have no active or future (draft) leases.
 */
export const deactivateFormerTenants = async (targetDate = null) => {
  const referenceDate = targetDate ? parseLocalDate(targetDate) : getLocalTime();
  
  try {
    const [formerTenants] = await db.query(
      `SELECT u.user_id, u.email
       FROM users u
       WHERE u.role = 'tenant' AND u.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM leases l 
         WHERE l.tenant_id = u.user_id 
         AND (l.status = 'active' OR l.status = 'draft')
       )
       AND EXISTS (
         SELECT 1 
         FROM leases l2 
         JOIN units un2 ON l2.unit_id = un2.unit_id
         JOIN properties p2 ON un2.property_id = p2.property_id
         WHERE l2.tenant_id = u.user_id
         GROUP BY l2.tenant_id
         HAVING MAX(l2.end_date) < DATE_SUB(?, INTERVAL p2.tenant_deactivation_days DAY)
       )`,
      [referenceDate]
    );

    if (formerTenants.length > 0) {
      console.log(`Found ${formerTenants.length} former tenants eligible for deactivation.`);
      const ids = formerTenants.map(t => t.user_id);
      
      await db.query(
        "UPDATE users SET status = 'inactive' WHERE user_id IN (?)",
        [ids]
      );

      for (const tenant of formerTenants) {
        console.log(`[Revocation] Deactivated account for former tenant: ${tenant.email} (User ID: ${tenant.user_id})`);
        
        // Log to Audit trail
        try {
          const auditLogger = (await import('./auditLogger.js')).default;
          await auditLogger.log({
            userId: null, // System action
            actionType: 'TENANT_ACCESS_REVOKED',
            entityId: tenant.user_id,
            details: { reason: 'Lease ended past property-specific deactivation period', referenceDate }
          });
        } catch (auditErr) {
          console.error(`Failed to log audit for revocation of ${tenant.user_id}:`, auditErr);
        }
      }
    }
  } catch (error) {
    console.error('Error in former tenant deactivation:', error);
  }
};
/**
 * [C4 FIX] Auto-acknowledge refunds if over 7 days in awaiting_acknowledgment
 */
export const autoAcknowledgeRefunds = async () => {
  try {
    const [leases] = await db.query(
      `SELECT l.lease_id, l.deposit_status, l.proposed_refund_amount, 
              (SELECT (COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0)) 
               FROM accounting_ledger 
               WHERE lease_id = l.lease_id AND category IN ('deposit_held', 'deposit_withheld', 'deposit_refund')) as real_deposit_balance
       FROM leases l
       WHERE l.deposit_status = 'awaiting_acknowledgment'`
    );

    for (const lease of leases) {
      const [approvalLogs] = await db.query(
        `SELECT created_at FROM audit_logs 
         WHERE entity_id = ? AND action_type = 'DEPOSIT_REFUND_APPROVED' 
         ORDER BY created_at DESC LIMIT 1`,
        [lease.lease_id]
      );
      
      let approvalDateStr;
      if (approvalLogs.length > 0) {
         approvalDateStr = formatToLocalDate(approvalLogs[0].created_at);
      } else {
         const fallbackDate = new Date();
         fallbackDate.setDate(fallbackDate.getDate() - 8);
         approvalDateStr = formatToLocalDate(fallbackDate);
      }

      const diffDays = (parseLocalDate(today()) - parseLocalDate(approvalDateStr)) / (1000 * 60 * 60 * 24);
      if (diffDays >= 7) {
        console.log(`[Auto-Ack] Auto-acknowledging refund for lease ${lease.lease_id} after 7 days.`);
        
        const currentBalance = Number(lease.real_deposit_balance || 0);
        const proposedAmount = Number(lease.proposed_refund_amount || 0);
        const finalStatus = proposedAmount >= currentBalance ? 'refunded' : 'partially_refunded';

        await db.query(`UPDATE leases SET deposit_status = ? WHERE lease_id = ?`, [finalStatus, lease.lease_id]);

        try {
          const auditLogger = (await import('./auditLogger.js')).default;
          await auditLogger.log({
            userId: null,
            actionType: 'DEPOSIT_REFUND_ACKNOWLEDGED',
            entityId: lease.lease_id,
            details: { status: finalStatus, amount: proposedAmount, mechanism: 'auto_timeout' },
          });
        } catch (auditErr) {
          console.error(`Failed to log auto-ack audit for ${lease.lease_id}:`, auditErr);
        }
      }
    }
  } catch (error) {
    console.error('Error auto-acknowledging refunds:', error);
  }
};

/**
 * [C5 FIX] SLA Escalation for Maintenance Requests
 */
export const escalateOverdueMaintenance = async () => {
  try {
    const [openRequests] = await db.query(
      `SELECT r.request_id, r.title, r.priority, r.created_at, r.status, u.unit_number, p.name as property_name, p.owner_id
       FROM maintenance_requests r
       JOIN units u ON r.unit_id = u.unit_id
       JOIN properties p ON u.property_id = p.property_id
       WHERE r.status IN ('submitted', 'in_progress')`
    );

    const nowTime = getLocalTime().getTime();

    for (const req of openRequests) {
      const createdTime = new Date(req.created_at).getTime();
      let thresholdHours = 0;

      if (req.priority === 'urgent') thresholdHours = 24;
      else if (req.priority === 'high') thresholdHours = 72;
      else if (req.priority === 'normal') thresholdHours = 168;

      if (thresholdHours > 0) {
        const elapsedHours = (nowTime - createdTime) / (1000 * 60 * 60);
        if (elapsedHours > thresholdHours) {
          const alertMsg = `[SLA BREACH] Maintenance request '${req.title}' for Unit ${req.unit_number} (${req.property_name}) is overdue based on its ${req.priority} priority. Action required.`;
          
          await notificationModel.create({
            userId: req.owner_id,
            message: alertMsg,
            type: 'maintenance',
            severity: 'urgent'
          });

          const [treasurers] = await db.query(`SELECT user_id FROM users WHERE role = 'treasurer'`);
          for (const t of treasurers) {
            await notificationModel.create({
              userId: t.user_id,
              message: alertMsg,
              type: 'maintenance',
              severity: 'urgent'
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error escalating overdue maintenance:', error);
  }
};

/**
 * Unified Nightly Cron Job (Locking + Backfill)
 */
export const runNightlyCron = async (targetDate = null) => {
  const executionDate = targetDate || today();
  console.log(`--- Starting Nightly Cron Activities for ${executionDate} ---`);

  try {
    // 1. Warnings & Expiries
    await sendLeaseExpiryWarnings();
    await checkLeaseExpiration();
    await leaseService.processAutomatedEscalations();

    // 2. Billing (Rent)
    await generateRentInvoices();

    // 3. Billing (Late Fees)
    await applyLateFees();

    // 4. Maintenance / Lead Expiries
    await syncUnitStatuses();
    await cleanupOldNotifications();
    await expireStaleLeads();
    await expireStaleRenewals();
    await expireDraftLeases();
    await deactivateFormerTenants(executionDate);
    await escalateOverdueMaintenance();
    
    // 5. Refund Operations
    await autoAcknowledgeRefunds();

    await logCronExecution('nightly_billing', executionDate, 'success');
  } catch (err) {
    await logCronExecution('nightly_billing', executionDate, 'failed', err.message);
    throw err;
  }
};

/**
 * Main Entry Point with Backfill Logic
 */
export const executeNightlyPayload = async () => {
  await runWithLock('nightly_billing', async () => {
    // [B5 FIX] BACKFILL LOGIC: Read from cron_checkpoints instead of cron_logs
    const [lastRun] = await db.query(
      "SELECT last_success_date AS execution_date FROM cron_checkpoints WHERE job_name = 'nightly_billing' AND status = 'success' LIMIT 1"
    );

    const todayDate = parseLocalDate(today());
    let startDate;

    if (lastRun.length > 0) {
      startDate = addDays(lastRun[0].execution_date, 1);
    } else {
      startDate = todayDate;
    }

    // Process all missed days up to today
    let current = startDate;
    while (current <= todayDate) {
      const dateStr = formatToLocalDate(current);
      await runNightlyCron(dateStr);
      current = addDays(current, 1);
    }
  });
};

const initCronJobs = () => {
  // Main Nightly Cron (Run at 1:00 AM)
  cron.schedule('0 1 * * *', executeNightlyPayload);

  // Reminders (Non-critical, don't need full locking/backfill for now)
  cron.schedule('0 7 * * *', sendVisitReminders);
  cron.schedule('0 8 * * *', sendRentReminders);
};

export default initCronJobs;
