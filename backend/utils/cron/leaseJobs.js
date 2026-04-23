// ============================================================================
//  LEASE JOBS (Lifecycle Automation: Expiry, Activation, Unit Sync)
// ============================================================================

import db from '../../config/db.js';
import leaseModel from '../../models/leaseModel.js';
import invoiceModel from '../../models/invoiceModel.js';
import notificationModel from '../../models/notificationModel.js';
import emailService from '../emailService.js';
import { ROLES } from '../roleUtils.js';
import { runWithLock } from '../distributionLock.js';

export const checkLeaseExpiration = async () => {
  const currentToday = today();
  const lockName = `check_lease_expiration_${currentToday.getFullYear()}_${currentToday.getMonth() + 1}_${currentToday.getDate()}`;

  const lockResult = await runWithLock(lockName, 1800, async () => {
    console.log('Running lease expiration check...');
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const currentToday = today();

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
          // [HARDENED] Deterministic Locking Order (Unit -> Lease) to prevent deadlocks
          await connection.query(
            'SELECT unit_id FROM units WHERE unit_id = ? FOR UPDATE',
            [lease.unit_id]
          );
          await connection.query(
            'SELECT lease_id FROM leases WHERE lease_id = ? FOR UPDATE',
            [lease.lease_id]
          );

          await connection.query(
            "UPDATE leases SET status = 'expired' WHERE lease_id = ?",
            [lease.lease_id]
          );

          const [successorLeases] = await connection.query(
            "SELECT lease_id FROM leases WHERE unit_id = ? AND status = 'active' AND lease_id != ?",
            [lease.unit_id, lease.lease_id]
          );

          if (successorLeases.length > 0) {
            console.log(
              `Lease ${lease.lease_id} expired but Unit ${lease.unit_id} has active successor lease. Skipping maintenance.`
            );
          } else {
            await connection.query(
              "UPDATE units SET status = 'maintenance', is_turnover_cleared = 0 WHERE unit_id = ?",
              [lease.unit_id]
            );
            console.log(
              `Lease ${lease.lease_id} is now EXPIRED. Unit ${lease.unit_id} set to Maintenance (Turnover).`
            );
          }

          if (lease.owner_id) {
            await notificationModel.create(
              {
                userId: lease.owner_id,
                message: `Lease for Unit ${lease.unit_id} has EXPIRED. Unit is now in Maintenance for turnover. Please process checkout.`,
                type: 'lease',
                severity: 'info',
              },
              connection
            );
          }

          const treasurers = await connection
            .query('SELECT user_id FROM users WHERE role = ?', [
              ROLES.TREASURER,
            ])
            .then(([rows]) => rows);
          for (const t of treasurers) {
            await notificationModel.create(
              {
                userId: t.user_id,
                message: `Lease #${lease.lease_id} has EXPIRED. Please prepare for Security Deposit Refund.`,
                type: 'lease',
                severity: 'warning',
              },
              connection
            );
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
  });

  if (!lockResult.success) {
    console.log(
      `[Cron] Skipping Lease Expiration Check: A process for "${lockName}" is already running.`
    );
  }
};

export const syncUnitStatuses = async () => {
  const currentToday = today();
  const lockName = `sync_unit_statuses_${currentToday.getFullYear()}_${currentToday.getMonth() + 1}_${currentToday.getDate()}`;

  const lockResult = await runWithLock(lockName, 1800, async () => {
    console.log('Running unit status synchronization...');
    try {
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
        const ids = shouldBeOccupied.map((u) => u.unit_id);
        await db.query(
          `UPDATE units SET status = 'occupied' WHERE unit_id IN (?)`,
          [ids]
        );
      }

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
        const ids = shouldBeReserved.map((u) => u.unit_id);
        await db.query(
          `UPDATE units SET status = 'reserved' WHERE unit_id IN (?)`,
          [ids]
        );
      }

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
        const ids = shouldBeAvailable.map((u) => u.unit_id);
        await db.query(
          `UPDATE units SET status = 'available' WHERE unit_id IN (?)`,
          [ids]
        );
      }
    } catch (error) {
      console.error('Error syncing unit statuses:', error);
    }
  });

  if (!lockResult.success) {
    console.log(
      `[Cron] Skipping Unit Status Sync: A process for "${lockName}" is already running.`
    );
  }
};

export const expireDraftLeases = async () => {
  const currentToday = now();
  const lockName = `expire_draft_leases_${currentToday.getFullYear()}_${currentToday.getMonth() + 1}_${currentToday.getDate()}`;

  const lockResult = await runWithLock(lockName, 1800, async () => {
    console.log('Running draft lease expiry check...');
    try {
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
        console.log(
          `Found ${staleDrafts.length} stale draft leases. Expiring...`
        );
        const ids = staleDrafts.map((l) => l.lease_id);

        const connection = await db.getConnection();
        try {
          await connection.beginTransaction();

          await connection.query(
            "UPDATE leases SET status = 'cancelled' WHERE lease_id IN (?)",
            [ids]
          );

          const uniqueUnitIds = [...new Set(staleDrafts.map((l) => l.unit_id))];
          for (const unitId of uniqueUnitIds) {
            const [otherClaims] = await connection.query(
              "SELECT lease_id FROM leases WHERE unit_id = ? AND status IN ('active', 'draft', 'pending')",
              [unitId]
            );
            if (otherClaims.length === 0) {
              await connection.query(
                "UPDATE units SET status = 'available' WHERE unit_id = ? AND status = 'reserved'",
                [unitId]
              );
            }
          }

          for (const leaseId of ids) {
            await invoiceModel.voidPendingByLeaseId(leaseId, connection);

            await connection.query(
              `INSERT INTO system_audit_logs (action_type, entity_id, entity_type, details)
             VALUES ('RESERVATION_EXPIRED', ?, 'lease', 'System cron automatically cleared expired reservation')`,
              [leaseId]
            );
          }

          await connection.commit();
          console.log(
            `Successfully expired ${staleDrafts.length} draft leases.`
          );
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
  });

  if (!lockResult.success) {
    console.log(
      `[Cron] Skipping Draft Lease Expiry: A process for "${lockName}" is already running.`
    );
  }
};

export const activateUpcomingLeases = async () => {
  const currentToday = now();
  const dateStr = formatToLocalDate(currentToday);
  const lockName = `activate_pending_leases_${currentToday.getFullYear()}_${currentToday.getMonth() + 1}_${currentToday.getDate()}`;

  return await runWithLock(lockName, 1800, async () => {
    console.log('Running pending lease activation check...');
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [pendingLeases] = await connection.query(
        `SELECT l.lease_id, l.unit_id, l.tenant_id, l.start_date
         FROM leases l
         WHERE l.status = 'pending' AND l.start_date <= ?`,
        [dateStr]
      );

      if (pendingLeases.length > 0) {
        console.log(
          `[Cron] Found ${pendingLeases.length} pending leases for activation.`
        );

        for (const lease of pendingLeases) {
          // [M5] Deterministic Locking Order (Unit -> Lease) to prevent deadlocks
          await connection.query(
            'SELECT unit_id FROM units WHERE unit_id = ? FOR UPDATE',
            [lease.unit_id]
          );
          await connection.query(
            'SELECT lease_id FROM leases WHERE lease_id = ? FOR UPDATE',
            [lease.lease_id]
          );

          await connection.query(
            "UPDATE leases SET status = 'active' WHERE lease_id = ?",
            [lease.lease_id]
          );

          await connection.query(
            "UPDATE units SET status = 'occupied' WHERE unit_id = ?",
            [lease.unit_id]
          );

          try {
            const [tenantRows] = await connection.query(
              'SELECT email FROM users WHERE user_id = ?',
              [lease.tenant_id]
            );
            if (tenantRows.length > 0 && tenantRows[0].email) {
              const email = tenantRows[0].email;
              await connection.query(
                `UPDATE leads SET status = 'converted' 
                 WHERE (LOWER(TRIM(email)) = LOWER(TRIM(?)) OR (unit_id = ? AND status = 'interested'))
                 AND status = 'interested'`,
                [email, lease.unit_id]
              );
            }
          } catch (leadErr) {
            console.error(
              'Failed to convert leads during cron activation:',
              leadErr
            );
          }

          try {
            const userService = (await import('../../services/userService.js'))
              .default;
            await userService.triggerOnboarding(lease.tenant_id);
          } catch (usrErr) {
            console.error(
              'Failed to trigger onboarding during cron activation:',
              usrErr
            );
          }

          console.log(
            `[Cron] Lease #${lease.lease_id} successfully activated.`
          );
        }
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error('Error in pending lease activation check:', error);
      throw error;
    } finally {
      connection.release();
    }
  });
};

export const sendLeaseExpiryWarnings = async () => {
  const currentToday = now();
  const lockName = `send_lease_expiry_warnings_${currentToday.getFullYear()}_${currentToday.getMonth() + 1}_${currentToday.getDate()}`;

  const lockResult = await runWithLock(lockName, 1800, async () => {
    console.log('Running lease expiry warning check...');
    // Warn at 30 and 60 days

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
              role: ROLES.TENANT,
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
                role: ROLES.OWNER,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending expiry warnings:', error);
    }
  });

  if (!lockResult.success) {
    console.log(
      `[Cron] Skipping Lease Expiry Warnings: A process for "${lockName}" is already running.`
    );
  }
};
