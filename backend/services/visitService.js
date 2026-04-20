import visitModel from '../models/visitModel.js';
import leadModel from '../models/leadModel.js';
import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';
import notificationModel from '../models/notificationModel.js';
import emailService from '../utils/emailService.js';
import auditLogger from '../utils/auditLogger.js';
import AppError from '../utils/AppError.js';
import { isAtLeast, ROLES } from '../utils/roleUtils.js';
import leadService from './leadService.js';
import staffModel from '../models/staffModel.js';

class VisitService {
  // SCHEDULE VISIT: Booking engine for property viewings. Handles slot rounding, conflict detection, and availability guards.
  async scheduleVisit(data) {
    const { propertyId, unitId, name, email, phone, date, time, notes } = data;
    let unit = null;

    // 1. [VALIDATION] Mandatory field check
    if (!propertyId || !name || !email || !date || !time)
      throw new AppError('Missing required fields', 400);

    // 2. Slot Rounding: Snap requested time to nearest 30-minute interval for scheduling consistency
    let scheduledDate = new Date(`${date}T${time}`);
    const min = scheduledDate.getMinutes();
    if (min < 15) scheduledDate.setMinutes(0, 0, 0);
    else if (min < 45) scheduledDate.setMinutes(30, 0, 0);
    else {
      scheduledDate.setHours(scheduledDate.getHours() + 1);
      scheduledDate.setMinutes(0, 0, 0);
    }

    // 3. [VALIDATION] Business rules: Hours (9-6) and Lead Time (Min 2 hours notice)
    const hour = scheduledDate.getHours();
    if (hour < 9 || hour >= 18)
      throw new AppError('Visits limited to 9:00 AM - 6:00 PM.', 400);
    if (scheduledDate < new Date(Date.now() + 2 * 60 * 60 * 1000))
      throw new AppError('Min 2 hours lead time required.', 400);

    // 4. [CONCURRENCY] Unit Availability: Ensure unit is publicly available and not shadow-booked
    if (unitId) {
      unit = await unitModel.findById(unitId);
      if (!unit || unit.status !== 'available')
        throw new AppError('Unit unavailable for viewing.', 409);
      if (await visitModel.existsInSlot(unitId, scheduledDate))
        throw new AppError('Unit slot already booked.', 409);
    }

    // 5. [CONCURRENCY] Property Capacity: Guard against multiple concurrent tours at the same property
    if (
      (await visitModel.countInSlotByProperty(propertyId, scheduledDate)) >= 1
    )
      throw new AppError('Property capacity reached for this slot.', 409);

    // 6. Lead Context: Link visit to existing prospect or identify re-interest
    let leadId = await leadModel.findIdByEmailAndProperty(email, propertyId);
    if (leadId) await leadModel.update(leadId, { lastContactedAt: new Date() });

    // 7. Persist visit record
    const visitId = await visitModel.create({
      propertyId,
      unitId,
      leadId,
      visitorName: name,
      visitorEmail: email,
      visitorPhone: phone,
      scheduledDate,
      notes,
    });

    // 8. [SIDE EFFECT] Dispatch notifications to Owner (alert) and Visitor (confirmation)
    try {
      const details = await propertyModel.findOwnerDetails(propertyId);
      if (details) {
        await emailService.sendVisitNotification(details.owner_email, {
          visitorName: name,
          visitorPhone: phone,
          propertyName: details.property_name,
          unitNumber: unit?.unitNumber,
          scheduledDate,
          notes,
        });
        await emailService.sendVisitScheduledToVisitor(email, {
          visitorName: name,
          propertyName: details.property_name,
          unitNumber: unit?.unitNumber,
          scheduledDate,
          visitId,
        });
        if (details.owner_id)
          await notificationModel.create({
            userId: details.owner_id,
            message: `New Visit: ${name} @ ${details.property_name}`,
            type: 'visit',
            severity: 'info',
            entityType: 'visit',
            entityId: visitId,
          });
      }
    } catch (e) {
      console.error('Visit notification failed:', e);
    }

    return {
      visitId,
      leadId,
      roundedTime: scheduledDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  }

  // CANCEL VISIT: Terminates a scheduled viewing. Supports both staff and visitor-driven cancellations.
  async cancelVisit(visitId, user) {
    // 1. Verify existence
    const visit = await visitModel.findById(visitId);
    if (!visit) throw new AppError('Visit not found', 404);

    // 2. Perform state transition
    const success = await visitModel.updateStatus(visitId, 'cancelled');

    // 3. [AUDIT] Track cancellation source
    if (success) {
      await auditLogger.log({
        userId: user?.user_id || user?.id || null,
        actionType: 'VISIT_CANCELLED',
        entityId: visitId,
        entityType: 'visit',
        details: { cancelledBy: user ? 'staff' : 'visitor' },
      });
    }

    return success;
  }

  // FETCH VISITS: Retrieves tour schedule filtered by access rights.
  async getVisits(user) {
    // [SECURITY] RBAC filtering
    if (user.role === ROLES.SYSTEM) return await visitModel.findAll({});
    if (user.role === ROLES.OWNER)
      return await visitModel.findAll({ ownerId: user.id });

    if (user.role === ROLES.TREASURER) {
      const assigned = await staffModel.getAssignedProperties(user.id);
      const propertyIds = assigned.map((p) => p.property_id);
      if (propertyIds.length === 0) return [];
      return await visitModel.findAll({ propertyIds });
    }

    throw new AppError('Access denied.', 403);
  }

  // UPDATE STATUS: Lifecycle management for visits. Includes automatic Lead progression logic.
  async updateStatus(id, status, user) {
    // 1. [SECURITY] Role check
    if (!isAtLeast(user?.role, ROLES.TREASURER))
      throw new AppError('Permission denied.', 403);
    if (
      !['pending', 'confirmed', 'cancelled', 'completed', 'no-show'].includes(
        status
      )
    )
      throw new AppError('Invalid status.', 400);

    const visit = await visitModel.findById(id);
    if (!visit) throw new AppError('Visit not found', 404);

    // 2. Commit transition
    const success = await visitModel.updateStatus(id, status);

    // 3. [SIDE EFFECT] CRM Logic: If visit is 'completed', automatically progress the Lead to 'viewed' status
    if (success && visit.leadId) {
      if (status === 'completed') {
        try {
          await leadService.updateLead(
            visit.leadId,
            { status: 'viewed' },
            user
          );
        } catch (e) {
          console.error('Auto-progression fail:', e);
        }
      } else if (status === 'confirmed') {
        await leadModel.update(visit.leadId, { lastContactedAt: new Date() });
      }
    }

    // 4. [SIDE EFFECT] Notify Visitor of the confirmed/cancelled state
    try {
      if (visit.visitorEmail) {
        await emailService.sendVisitStatusUpdate(
          visit.visitorEmail,
          {
            propertyName: visit.propertyName || 'Property',
            unitNumber: visit.unitNumber,
            scheduledDate: visit.scheduledDate,
          },
          status
        );
      }
    } catch (e) {
      console.error('Status update email failed:', e);
    }

    // 5. [AUDIT] Track the management action
    await auditLogger.log({
      userId: user.user_id || user.id,
      actionType: 'VISIT_STATUS_UPDATED',
      entityId: id,
      entityType: 'visit',
      details: { newStatus: status },
    });

    return true;
  }

  // RESCHEDULE VISIT: Tool for Staff to move viewing times. Re-runs all conflict/capacity checks.
  async rescheduleVisit(id, data, user) {
    const { date, time, notes } = data;
    if (!date || !time)
      throw new AppError('Reschedule requires date and time.', 400);

    const visit = await visitModel.findById(id);
    if (!visit) throw new AppError('Visit not found', 404);

    // 1. [SECURITY] Role check
    if (!isAtLeast(user?.role, ROLES.TREASURER))
      throw new AppError('Access denied.', 403);

    // 2. Precision Scheduling: Snap to 30-min slot
    let scheduledDate = new Date(`${date}T${time}`);
    const min = scheduledDate.getMinutes();
    if (min < 15) scheduledDate.setMinutes(0, 0, 0);
    else if (min < 45) scheduledDate.setMinutes(30, 0, 0);
    else {
      scheduledDate.setHours(scheduledDate.getHours() + 1);
      scheduledDate.setMinutes(0, 0, 0);
    }

    // 3. [CONCURRENCY] Re-validate Unit and Property-Wide capacity for the new slot
    if (
      visit.unitId &&
      (await visitModel.existsInSlot(visit.unitId, scheduledDate, id))
    )
      throw new AppError('Unit slot occupied.', 409);
    if (
      (await visitModel.countInSlotByProperty(
        visit.propertyId,
        scheduledDate,
        id
      )) >= 1
    )
      throw new AppError('Property capacity reached.', 409);

    // 4. Update and Reset status to pending (Requires re-confirmation of the new time)
    await visitModel.update(id, {
      scheduledDate,
      notes: notes || visit.notes,
      status: 'pending',
    });

    // 5. [SIDE EFFECT] Deliver new scheduling email to Visitor
    try {
      if (visit.visitorEmail)
        await emailService.sendVisitScheduledToVisitor(visit.visitorEmail, {
          visitorName: visit.visitorName,
          propertyName: visit.propertyName || 'Property',
          unitNumber: visit.unitNumber,
          scheduledDate,
          visitId: id,
        });
    } catch (e) {
      console.error('Reschedule notification failed:', e);
    }

    return { scheduledDate };
  }
}

export default new VisitService();
