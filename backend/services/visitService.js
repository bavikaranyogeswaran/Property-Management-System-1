import visitModel from '../models/visitModel.js';
import leadModel from '../models/leadModel.js';
import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';
import notificationModel from '../models/notificationModel.js';
import emailService from '../utils/emailService.js';
import auditLogger from '../utils/auditLogger.js';

class VisitService {
  async scheduleVisit(data) {
    const { propertyId, unitId, name, email, phone, date, time, notes } = data;
    let unit = null;

    if (!propertyId || !name || !email || !date || !time) {
      throw new Error('Missing required fields');
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
      throw new Error(
        'Visits can only be scheduled between 9:00 AM and 6:00 PM.'
      );
    }

    // 2b. Lead Time Validation (Min 2 hours)
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    if (scheduledDate < twoHoursFromNow) {
      throw new Error('Visits must be scheduled at least 2 hours in advance');
    }

    // 3. Unit Status Validation
    if (unitId) {
      unit = await unitModel.findById(unitId);
      if (!unit) throw new Error('Unit not found');
      if (unit.status !== 'available') {
        throw new Error(
          `Unit ${unit.unitNumber} is currently ${unit.status} and not available for visits.`
        );
      }

      // 4. Conflict Detection
      const hasConflict = await visitModel.existsInSlot(unitId, scheduledDate);
      if (hasConflict) {
        throw new Error(
          'This time slot is already booked for this unit. Please select another time.'
        );
      }
    }

    // 5. Property-Wide Capacity Detection (Max 1 concurrent visit per property)
    const concurrentVisits = await visitModel.countInSlotByProperty(
      propertyId,
      scheduledDate
    );
    if (concurrentVisits >= 1) {
      throw new Error(
        'Property viewing capacity reached for this time slot (Max 1). Please select another time.'
      );
    }

    let leadId = await leadModel.findIdByEmailAndProperty(email, propertyId);
    if (!leadId) {
      leadId = await leadModel.create({
        propertyId,
        unitId: unitId || null,
        interestedUnit: unitId || null,
        name,
        phone,
        email,
        notes: `Auto-created via Schedule Visit`,
        status: 'interested',
      });
    } else {
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
    if (!visit) throw new Error('Visit not found');

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
    if (user.role === 'owner') {
      return await visitModel.findAll({ ownerId: user.id });
    } else if (user.role === 'treasurer') {
      const staffModel = (await import('../models/staffModel.js')).default;
      const assigned = await staffModel.getAssignedProperties(user.id);
      const propertyIds = assigned.map((p) => p.property_id);

      if (propertyIds.length === 0) return [];
      return await visitModel.findAll({ propertyIds });
    } else {
      throw new Error(
        'Access denied. Insufficient permissions to view visits.'
      );
    }
  }

  async updateStatus(id, status, user) {
    if (!user || (user.role !== 'owner' && user.role !== 'treasurer')) {
      throw new Error(
        'Access denied. Only owners and treasurers can update visit status.'
      );
    }

    if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
      throw new Error('Invalid status');
    }

    const success = await visitModel.updateStatus(id, status);
    if (!success) throw new Error('Visit not found');

    // Logic Hook: Update Lead
    if (status === 'completed' || status === 'confirmed') {
      const visit = await visitModel.findById(id);
      if (visit && visit.lead_id) {
        // Update last contacted timestamp (lead stays 'interested' — no 'visited' ENUM value)
        await leadModel.update(visit.lead_id, { lastContactedAt: new Date() });
      }
    }

    // Email Visitor
    try {
      const visit = await visitModel.findById(id);
      if (visit && visit.visitor_email) {
        await emailService.sendVisitStatusUpdate(
          visit.visitor_email,
          {
            propertyName: visit.property_name || 'Property',
            unitNumber: visit.unit_number,
            scheduledDate: visit.scheduled_date,
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
}

export default new VisitService();
