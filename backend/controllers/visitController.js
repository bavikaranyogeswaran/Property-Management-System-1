import visitModel from '../models/visitModel.js';
import leadModel from '../models/leadModel.js';
import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';
import notificationModel from '../models/notificationModel.js';
import emailService from '../utils/emailService.js';

class VisitController {
  /**
   * Schedule a new visit.
   * Looks up existing lead by email/phone or creates a new one.
   */
  async scheduleVisit(req, res) {
    try {
      const { propertyId, unitId, name, email, phone, date, time, notes } =
        req.body;

      if (!propertyId || !name || !email || !date || !time) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Combine date and time
      const scheduledDate = new Date(`${date}T${time}`);

      // 1. Check if lead exists FOR THIS PROPERTY specifically
      let leadId = await leadModel.findIdByEmailAndProperty(email, propertyId);

      if (!leadId) {
        // Create new lead
        leadId = await leadModel.create({
          propertyId,
          unitId, // Interest in specific unit
          interestedUnit: unitId, // fallback
          name,
          phone,
          email,
          notes: `Auto-created via Schedule Visit`,
          status: 'interested',
        });
      }

      // 2. Create Visit
      // Also fetch property name for email if needed, but visitModel.create returns ID.
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

      // 3. Send Notifications (Email & In-App)
      try {
        // Get Property & Owner details
        const propertyDetails = await propertyModel.findOwnerDetails(propertyId);

        if (propertyDetails) {
          const { property_name, owner_email, owner_id } = propertyDetails;

          // Get unit number if applicable
          let unit_number = null;
          if (unitId) {
            const unit = await unitModel.findById(unitId);
            if (unit) unit_number = unit.unitNumber;
          }

          // A. Send Email
          await emailService.sendVisitNotification(owner_email, {
            visitorName: name,
            visitorPhone: phone,
            propertyName: property_name,
            unitNumber: unit_number,
            scheduledDate: scheduledDate,
            notes: notes,
          });

          // B. Send In-App Notification (Logic Fix)
          if (owner_id) {
            await notificationModel.create({
              userId: owner_id,
              message: `New Visit Scheduled: ${name} for ${property_name} on ${scheduledDate.toLocaleDateString()}`,
              type: 'visit',
              severity: 'info',
            });
          }
        }
      } catch (notifyError) {
        console.error('Failed to send visit notifications:', notifyError);
        // Non-blocking
      }

      // 4. Update Lead Timestamp (Logic Fix)
      if (leadId) {
        await leadModel.update(leadId, { lastContactedAt: new Date() });
      }

      res.status(201).json({
        message: 'Visit scheduled successfully',
        visitId,
        leadId,
      });
    } catch (error) {
      console.error('Error scheduling visit:', error);
      res.status(500).json({ error: 'Failed to schedule visit' });
    }
  }

  async getVisits(req, res) {
    try {
      // Assuming auth middleware puts user in req.user
      // If owner, show their property visits
      const ownerId = req.user?.id;
      const visits = await visitModel.findAll({ ownerId });
      res.json(visits);
    } catch (error) {
      console.error('Error fetching visits:', error);
      res.status(500).json({ error: 'Failed to fetch visits' });
    }
  }

  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (
        !['pending', 'confirmed', 'cancelled', 'completed'].includes(status)
      ) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const success = await visitModel.updateStatus(id, status);
      if (!success) {
        return res.status(404).json({ error: 'Visit not found' });
      }

      // Logic Fix: Update Lead Timestamp & Status on Completion
      if (status === 'completed' || status === 'confirmed') {
        const visit = await visitModel.findById(id);
        if (visit && visit.lead_id) {
          const leadModel = (await import('../models/leadModel.js')).default;
          const lead = await leadModel.findById(visit.lead_id);

          const updateData = { lastContactedAt: new Date() };

          // Upgrade status to 'visited' if currently just 'interested'
          if (status === 'completed' && lead && lead.status === 'interested') {
            updateData.status = 'visited';
          }

          await leadModel.update(visit.lead_id, updateData);
        }
      }

      // Send Email Notification to Visitor
      try {
        const visit = await visitModel.findById(id);
        if (visit && visit.visitor_email) {
          const emailService = (await import('../utils/emailService.js'))
            .default;
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
      } catch (emailErr) {
        console.error('Failed to send status email:', emailErr);
      }

      // Audit Log
      const auditLogger = (await import('../utils/auditLogger.js')).default;
      const userId = req.user ? req.user.id : null;
      await auditLogger.log(
        {
          userId,
          actionType: 'VISIT_STATUS_UPDATED',
          entityId: id,
          details: { newStatus: status },
        },
        req
      );

      res.json({ message: 'Visit status updated' });
    } catch (error) {
      console.error('Error updating visit status:', error);
      res.status(500).json({ error: 'Failed to update status' });
    }
  }
}

export default new VisitController();
