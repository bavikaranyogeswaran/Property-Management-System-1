// ============================================================================
//  CLEANUP & COMMUNICATION JOBS (Data Hygiene & Scheduled Reminders)
// ============================================================================

import db from '../db.js';
import emailService from '../emailService.js';
import billingEngine from '../billingEngine.js';
import {
  now,
  today,
  addDays,
  getLocalTime,
  parseLocalDate,
  formatToLocalDate,
} from '../dateUtils.js';
import { fromCents } from '../moneyUtils.js';
import { ROLES } from '../roleUtils.js';
import { runWithLock } from '../distributionLock.js';

// RENT REMINDERS: Sends 3-day warnings for upcoming rent due dates
export const sendRentReminders = async () => {
  const currentToday = now();
  const targetDay = billingEngine.RENT_DUE_DAY - 3;

  if (currentToday.getDate() !== targetDay) return;

  console.log('Running automated rent reminders...');
  try {
    const [activeLeases] = await db.query(
      "SELECT tenant_id, monthly_rent FROM leases WHERE status = 'active'"
    );
    const dueDate = `${currentToday.getFullYear()}-${String(currentToday.getMonth() + 1).padStart(2, '0')}-${String(billingEngine.RENT_DUE_DAY).padStart(2, '0')}`;

    for (const lease of activeLeases) {
      const [userRows] = await db.query(
        'SELECT email FROM users WHERE user_id = ?',
        [lease.tenant_id]
      );
      if (userRows.length > 0 && userRows[0].email) {
        await emailService.sendRentReminder(userRows[0].email, {
          amount: fromCents(lease.monthly_rent),
          dueDate: dueDate,
          daysLeft: 3,
        });
      }
    }
  } catch (error) {
    console.error('Error in automated rent reminders:', error);
  }
};

// NOTIFICATION CLEANUP: Deletes read notifications older than 30 days
export const cleanupOldNotifications = async () => {
  console.log('Running notification cleanup...');
  try {
    const notificationModel = (
      await import('../../models/notificationModel.js')
    ).default;
    const readDeleted = await notificationModel.deleteOlderThan(30);
    console.log(`Cleaned up ${readDeleted} notifications older than 30 days.`);
  } catch (error) {
    console.error('Error in notification cleanup:', error);
  }
};

// STALE LEAD AUTO-EXPIRY: Drops leads that have been 'interested' for 90+ days
export const expireStaleLeads = async () => {
  console.log('Running stale lead expiry...');
  try {
    const leadModel = (await import('../../models/leadModel.js')).default;
    const count = await leadModel.expireStaleLeads(90);
    console.log(`Expired ${count} stale leads.`);
  } catch (error) {
    console.error('Error expiring stale leads:', error);
  }
};

// VISIT REMINDERS: Sends 24h reminder emails to visitors
export const sendVisitReminders = async () => {
  console.log('Running visit reminders...');
  try {
    const visitModel = (await import('../../models/visitModel.js')).default;
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
        console.error(
          `Failed to send visit reminder for visit ${visit.visit_id}:`,
          emailErr
        );
      }
    }
    console.log(`Sent ${upcoming.length} visit reminders.`);
  } catch (error) {
    console.error('Error in visit reminders:', error);
  }
};

// STALE RENEWAL EXPIRY: Clears renewal requests after 14 days of inactivity
export const expireStaleRenewals = async () => {
  console.log('Running stale renewal request cleanup...');
  try {
    const cutoffDate = addDays(now(), -14);
    const [result] = await db.query(
      `UPDATE renewal_requests SET status = 'expired' WHERE status IN ('pending', 'negotiating') AND created_at < ?`,
      [cutoffDate]
    );
    if (result.affectedRows > 0) {
      console.log(`Expired ${result.affectedRows} stale renewal requests.`);
    }
  } catch (error) {
    console.error('Error expiring stale renewal requests:', error);
  }
};

// FORMER TENANT DEACTIVATION: Revokes portal access after deactivation grace period
export const deactivateFormerTenants = async (targetDate = null) => {
  const referenceDate = targetDate
    ? parseLocalDate(targetDate)
    : getLocalTime();
  try {
    const [formerTenants] = await db.query(
      `SELECT u.user_id, u.email
       FROM users u
       WHERE u.role = ? AND u.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM leases l WHERE l.tenant_id = u.user_id AND (l.status = 'active' OR l.status = 'draft'))
       AND EXISTS (
         SELECT 1 FROM leases l2 JOIN units un2 ON l2.unit_id = un2.unit_id JOIN properties p2 ON un2.property_id = p2.property_id
         WHERE l2.tenant_id = u.user_id GROUP BY l2.tenant_id
         HAVING MAX(l2.end_date) < DATE_SUB(?, INTERVAL p2.tenant_deactivation_days DAY)
       )`,
      [ROLES.TENANT, referenceDate]
    );

    if (formerTenants.length > 0) {
      const ids = formerTenants.map((t) => t.user_id);
      await db.query(
        "UPDATE users SET status = 'inactive' WHERE user_id IN (?)",
        [ids]
      );
      for (const tenant of formerTenants) {
        try {
          const auditLogger = (await import('../auditLogger.js')).default;
          await auditLogger.log({
            userId: null,
            actionType: 'TENANT_ACCESS_REVOKED',
            entityId: tenant.user_id,
            entityType: 'user',
            details: { reason: 'Lease ended past grace period', referenceDate },
          });
        } catch (auditErr) {
          console.error(
            `Failed to log audit for revocation of ${tenant.user_id}:`,
            auditErr
          );
        }
      }
      console.log(`Deactivated ${formerTenants.length} former tenants.`);
    }
  } catch (error) {
    console.error('Error in former tenant deactivation:', error);
  }
};

// AUTO-ACKNOWLEDGE REFUNDS: Finalizes deposit refunds if tenant hasn't responded in 14 days
export const autoAcknowledgeRefunds = async () => {
  return await runWithLock('auto_ack_refunds', 1800, async () => {
    try {
      const [leases] = await db.query(
        `SELECT l.lease_id, l.deposit_status, l.proposed_refund_amount, 
                (SELECT (COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0)) FROM accounting_ledger WHERE lease_id = l.lease_id AND category IN ('deposit_held', 'deposit_withheld', 'deposit_refund')) as real_deposit_balance
         FROM leases l WHERE l.deposit_status = 'awaiting_acknowledgment'`
      );

      for (const lease of leases) {
        const [approvalLogs] = await db.query(
          "SELECT created_at FROM system_audit_logs WHERE entity_id = ? AND action_type = 'DEPOSIT_REFUND_APPROVED' ORDER BY created_at DESC LIMIT 1",
          [lease.lease_id]
        );

        let approvalDateStr =
          approvalLogs.length > 0
            ? formatToLocalDate(approvalLogs[0].created_at)
            : formatToLocalDate(addDays(now(), -8));
        const diffDays =
          (parseLocalDate(today()) - parseLocalDate(approvalDateStr)) /
          (1000 * 60 * 60 * 24);

        if (diffDays >= 14) {
          const currentBalance = Number(lease.real_deposit_balance || 0);
          const proposedAmount = Number(lease.proposed_refund_amount || 0);
          const finalStatus =
            proposedAmount >= currentBalance
              ? 'refunded'
              : 'partially_refunded';

          await db.query(
            'UPDATE leases SET deposit_status = ? WHERE lease_id = ?',
            [finalStatus, lease.lease_id]
          );
          try {
            const auditLogger = (await import('../auditLogger.js')).default;
            await auditLogger.log({
              userId: null,
              actionType: 'DEPOSIT_REFUND_ACKNOWLEDGED',
              entityId: lease.lease_id,
              entityType: 'lease',
              details: {
                status: finalStatus,
                amount: proposedAmount,
                mechanism: 'auto_timeout',
              },
            });
          } catch (auditErr) {
            console.error(
              `Failed to log auto-ack audit for ${lease.lease_id}:`,
              auditErr
            );
          }
        }
      }
    } catch (error) {
      console.error('Error auto-acknowledging refunds:', error.message);
    }
  });
};
