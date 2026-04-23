// ============================================================================
//  MAINTENANCE JOBS (SLA Monitoring & Escalations)
// ============================================================================

import db from '../db.js';
import notificationModel from '../../models/notificationModel.js';
import logger from '../logger.js';
import { getLocalTime } from '../dateUtils.js';
import { ROLES } from '../roleUtils.js';
import { runWithLock } from '../distributionLock.js';

/**
 * [H24 FIX] Maintenance SLA Monitoring
 * Alerts owners/treasurers for stale requests.
 */
export const checkMaintenanceSLA = async () => {
  return await runWithLock('check_maintenance_sla', 1800, async () => {
    try {
      const [staleRequests] = await db.query(
        `SELECT mr.*, p.owner_id, p.name as property_name, u.unit_number
         FROM maintenance_requests mr
         JOIN units u ON mr.unit_id = u.unit_id
         JOIN properties p ON u.property_id = p.property_id
         WHERE mr.status = 'submitted'
         AND (
           (mr.priority IN ('high', 'urgent') AND mr.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR))
           OR 
           (mr.priority IN ('low', 'medium') AND mr.created_at < DATE_SUB(NOW(), INTERVAL 3 DAY))
         )`
      );

      for (const req of staleRequests) {
        // 1. Notify Owner
        await notificationModel.create({
          userId: req.owner_id,
          message: `SLA BREACH: Maintenance Request '${req.title}' for ${req.property_name} (Unit ${req.unit_number}) has been idle for too long.`,
          type: 'maintenance',
          severity: 'urgent',
          entityType: 'maintenance_request',
          entityId: req.request_id,
        });

        // 2. Notify assigned Treasurers
        const [treasurers] = await db.query(
          `SELECT user_id FROM staff_property_assignments WHERE property_id = (
            SELECT property_id FROM units WHERE unit_id = ?
          )`,
          [req.unit_id]
        );
        for (const t of treasurers) {
          await notificationModel.create({
            userId: t.user_id,
            message: `SLA BREACH: Maintenance Request '${req.title}' for ${req.property_name} (Unit ${req.unit_number}) is stale.`,
            type: 'maintenance',
            severity: 'urgent',
            entityType: 'maintenance_request',
            entityId: req.request_id,
          });
        }
      }

      if (staleRequests.length > 0) {
        logger.info(
          `[SLA] Sent alerts for ${staleRequests.length} stale maintenance requests.`
        );
      }
    } catch (error) {
      logger.error('Error in Maintenance SLA check:', error.message);
      throw error;
    }
  });
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
            severity: 'urgent',
          });

          const [treasurers] = await db.query(
            'SELECT user_id FROM users WHERE role = ?',
            [ROLES.TREASURER]
          );
          for (const t of treasurers) {
            await notificationModel.create({
              userId: t.user_id,
              message: alertMsg,
              type: 'maintenance',
              severity: 'urgent',
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error escalating overdue maintenance:', error);
  }
};
