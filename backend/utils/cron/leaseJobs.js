// ============================================================================
//  LEASE JOBS (Lifecycle Automation: Expiry, Activation, Unit Sync)
// ============================================================================

import db from '../db.js';
import leaseModel from '../../models/leaseModel.js';
import invoiceModel from '../../models/invoiceModel.js';
import notificationModel from '../../models/notificationModel.js';
import leaseService from '../../services/leaseService.js';
import {
  today,
  now,
  formatToLocalDate,
  addDays,
  parseLocalDate,
} from '../dateUtils.js';
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
