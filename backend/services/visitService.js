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
  async scheduleVisit(data) {
    const { propertyId, unitId, name, email, phone, date, time, notes } = data;
    let unit = null;

    if (!propertyId || !name || !email || !date || !time) {
      throw new AppError('Missing required fields', 400);
    }

    // 1. Time Slot Rounding (Nearest 30 mins)
    let scheduledDate = new Date(`${date}T${time}`);
    const minutes = scheduledDate.getMinutes();
    if (minutes < 15) scheduledDate.setMinutes(0, 0, 0);
    else if (minutes < 45) scheduledDate.setMinutes(30, 0, 0);
    else {
      scheduledDate.setHours(scheduledDate.getHours() + 1);
      scheduledDate.setMinutes(0, 0, 0);
    }

    // 2a. Business Hours Validation (9 AM - 6 PM)
    const hour = scheduledDate.getHours();
    if (hour < 9 || hour >= 18) {
      throw new AppError(
        'Visits can only be scheduled between 9:00 AM and 6:00 PM.',
        400
      );
    }

    // 2b. Lead Time Validation (Min 2 hours)
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    if (scheduledDate < twoHoursFromNow) {
      throw new AppError(
        'Visits must be scheduled at least 2 hours in advance',
        400
      );
    }

    // 3. Unit Status Validation
    if (unitId) {
      unit = await unitModel.findById(unitId);
      if (!unit) throw new AppError('Unit not found', 404);
      if (unit.status !== 'available') {
        throw new AppError(
          `Unit ${unit.unitNumber} is currently ${unit.status} and not available for visits.`,
          409
        );
      }

      // 4. Conflict Detection
      const hasConflict = await visitModel.existsInSlot(unitId, scheduledDate);
      if (hasConflict) {
        throw new AppError(
          'This time slot is already booked for this unit (within 30 mins). Please select another time.',
          409
        );
      }
    }

    // 5. Property-Wide Capacity Detection (Max 1 concurrent visit per property)
    const concurrentVisits = await visitModel.countInSlotByProperty(
      propertyId,
      scheduledDate
    );
    if (concurrentVisits >= 1) {
      throw new AppError(
        'Property viewing capacity reached for this time slot (Max 1 within 30 mins). Please select another time.',
        409
      );
    }

    let leadId = await leadModel.findIdByEmailAndProperty(email, propertyId);
    if (leadId) {
      await leadModel.update(leadId, { lastContactedAt: new Date() });
    }

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

    // Notifications
    try {
      const propertyDetails = await propertyModel.findOwnerDetails(propertyId);
      if (propertyDetails) {
        const { property_name, owner_email, owner_id } = propertyDetails;
        let unit_number = null;
        if (unitId) {
          // unit is already fetched above if unitId exists
          unit_number = unit ? unit.unitNumber : null;
        }

        // Notify Owner
        await emailService.sendVisitNotification(owner_email, {
          visitorName: name,
          visitorPhone: phone,
          propertyName: property_name,
          unitNumber: unit_number,
          scheduledDate,
          notes,
        });

        // Notify Visitor
        await emailService.sendVisitScheduledToVisitor(email, {
          visitorName: name,
          propertyName: property_name,
          unitNumber: unit_number,
          scheduledDate,
          visitId,
        });

        if (owner_id) {
          await notificationModel.create({
            userId: owner_id,
            message: `New Visit Scheduled: ${name} for ${property_name} on ${scheduledDate.toLocaleDateString()}`,
            type: 'visit',
            severity: 'info',
            entityType: 'visit',
            entityId: visitId,
          });
        }
      }
    } catch (e) {
      console.error('Notification failed', e);
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

  async cancelVisit(visitId, user) {
    // If user is provided, check ownership if needed.
    // For public cancellation, we might use a token, but for now we follow the simple pattern.
    const visit = await visitModel.findById(visitId);
    if (!visit) throw new AppError('Visit not found', 404);

    const success = await visitModel.updateStatus(visitId, 'cancelled');

    if (success) {
      await auditLogger.log(
        {
          userId: user ? user.user_id : user ? user.id : null,
          actionType: 'VISIT_CANCELLED',
          entityId: visitId,
          entityType: 'visit',
          details: { cancelledBy: user ? 'user' : 'visitor' },
        },
        { user }
      );
    }

    return success;
  }

  async getVisits(user) {
    if (user.role === ROLES.SYSTEM) {
      return await visitModel.findAll({});
    }
    if (user.role === ROLES.OWNER) {
      return await visitModel.findAll({ ownerId: user.id });
    } else if (user.role === ROLES.TREASURER) {
      const assigned = await staffModel.getAssignedProperties(user.id);
      const propertyIds = assigned.map((p) => p.property_id);

      if (propertyIds.length === 0) return [];
      return await visitModel.findAll({ propertyIds });
    } else {
      throw new AppError(
        'Access denied. Insufficient permissions to view visits.',
        403
      );
    }
  }

  async updateStatus(id, status, user) {
    if (!user || !isAtLeast(user.role, ROLES.TREASURER)) {
      throw new AppError(
        'Access denied. Only owners and treasurers can update visit status.',
        403
      );
    }

    const validStatuses = [
      'pending',
      'confirmed',
      'cancelled',
      'completed',
      'no-show',
    ];
    if (!validStatuses.includes(status)) {
      throw new AppError('Invalid status', 400);
    }

    const success = await visitModel.updateStatus(id, status);
    if (!success) throw new AppError('Visit not found', 404);

    // Logic Hook: Update Lead
    const visit = await visitModel.findById(id);
    if (visit && visit.leadId) {
      if (status === 'completed') {
        // [Flow 2] Automatically progress lead to 'viewed'
        try {
          await leadService.updateLead(
            visit.leadId,
            { status: 'viewed' },
            user
          );
        } catch (leadErr) {
          console.warn('Failed to auto-progress lead status:', leadErr.message);
          // Non-blocking for the visit update
        }
      } else if (status === 'confirmed') {
        await leadModel.update(visit.leadId, { lastContactedAt: new Date() });
      }
    }

    // Email Visitor
    try {
      if (visit && visit.visitorEmail) {
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
      console.error('Email failed', e);
    }

    // Audit
    await auditLogger.log(
      {
        userId: user ? user.user_id : user ? user.id : null,
        actionType: 'VISIT_STATUS_UPDATED',
        entityId: id,
        entityType: 'visit',
        details: { newStatus: status },
      },
      { user }
    );

    return true;
  }

  async rescheduleVisit(id, data, user) {
    const { date, time, notes } = data;
    if (!date || !time)
      throw new AppError('New date and time are required', 400);

    const visit = await visitModel.findById(id);
    if (!visit) throw new AppError('Visit not found', 404);

    // Security check: Only owner/staff or the visitor themselves (if we had a token)
    // For now, owner/staff only as per the controller routes
    if (!user || !isAtLeast(user.role, ROLES.TREASURER)) {
      throw new AppError('Access denied.', 403);
    }

    // 1. Time Slot Rounding
    let scheduledDate = new Date(`${date}T${time}`);
    const minutes = scheduledDate.getMinutes();
    if (minutes < 15) scheduledDate.setMinutes(0, 0, 0);
    else if (minutes < 45) scheduledDate.setMinutes(30, 0, 0);
    else {
      scheduledDate.setHours(scheduledDate.getHours() + 1);
      scheduledDate.setMinutes(0, 0, 0);
    }

    // 2. Conflict Detection (H24 FIX: Uses 30-min Proximity Logic)
    if (visit.unitId) {
      const hasConflict = await visitModel.existsInSlot(
        visit.unitId,
        scheduledDate,
        id // Exclude self
      );
      if (hasConflict) {
        throw new AppError(
          'The new time slot is already booked for this unit (within 30 mins). Please select another time.',
          409
        );
      }
    }

    // 2b. Property-Wide Capacity Detection (Max 1 concurrent visit per property)
    const concurrentVisits = await visitModel.countInSlotByProperty(
      visit.propertyId,
      scheduledDate,
      id // Exclude self
    );
    if (concurrentVisits >= 1) {
      throw new AppError(
        'Property viewing capacity reached for this time slot (Max 1 within 30 mins). Please select another time.',
        409
      );
    }

    // 3. Update
    await visitModel.update(id, {
      scheduledDate,
      notes: notes || visit.notes,
      status: 'pending', // Reset to pending for re-confirmation
    });

    // 4. Notify
    try {
      if (visit.visitorEmail) {
        await emailService.sendVisitScheduledToVisitor(visit.visitorEmail, {
          visitorName: visit.visitorName,
          propertyName: visit.propertyName || 'Property',
          unitNumber: visit.unitNumber,
          scheduledDate,
          visitId: id,
        });
      }
    } catch (e) {
      console.error('Reschedule notification failed', e);
    }

    return { scheduledDate };
  }
}

export default new VisitService();
