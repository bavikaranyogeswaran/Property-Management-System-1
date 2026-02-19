
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

        if (!propertyId || !name || !email || !date || !time) {
             throw new Error('Missing required fields');
        }

        const scheduledDate = new Date(`${date}T${time}`);
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
                     const unit = await unitModel.findById(unitId);
                     unit_number = unit ? unit.unitNumber : null;
                 }

                 await emailService.sendVisitNotification(owner_email, {
                     visitorName: name,
                     visitorPhone: phone,
                     propertyName: property_name,
                     unitNumber: unit_number,
                     scheduledDate,
                     notes,
                 });

                 if (owner_id) {
                     await notificationModel.create({
                         userId: owner_id,
                         message: `New Visit Scheduled: ${name} for ${property_name} on ${scheduledDate.toLocaleDateString()}`,
                         type: 'visit',
                         severity: 'info',
                     });
                 }
            }
        } catch (e) {
            console.error('Notification failed', e);
        }

        return { visitId, leadId };
    }

    async getVisits(user) {
        // Owner only? Or Treasurer? usually Owner.
        const ownerId = user.id; // Model handles filtering by ownerId if provided
        return await visitModel.findAll({ ownerId });
    }

    async updateStatus(id, status, user) {
        if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
            throw new Error('Invalid status');
        }

        const success = await visitModel.updateStatus(id, status);
        if (!success) throw new Error('Visit not found');

        // Logic Hook: Update Lead
        if (status === 'completed' || status === 'confirmed') {
             const visit = await visitModel.findById(id);
             if (visit && visit.lead_id) {
                 const lead = await leadModel.findById(visit.lead_id);
                 const updateData = { lastContactedAt: new Date() };
                 
                 if (status === 'completed' && lead && lead.status === 'interested') {
                     updateData.status = 'visited';
                 }
                 await leadModel.update(visit.lead_id, updateData);
             }
        }

        // Email Visitor
        try {
            const visit = await visitModel.findById(id);
            if (visit && visit.visitor_email) {
                 await emailService.sendVisitStatusUpdate(visit.visitor_email, {
                     propertyName: visit.property_name || 'Property',
                     unitNumber: visit.unit_number,
                     scheduledDate: visit.scheduled_date,
                 }, status);
            }
        } catch (e) { 
            console.error('Email failed', e);
        }

        // Audit
        await auditLogger.log({
            userId: user ? user.id : null,
            actionType: 'VISIT_STATUS_UPDATED',
            entityId: id,
            details: { newStatus: status },
        }, { user });
        
        return true;
    }
}

export default new VisitService();
