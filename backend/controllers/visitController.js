
import visitModel from '../models/visitModel.js';
import leadModel from '../models/leadModel.js';
import db from '../config/db.js';
import emailService from '../utils/emailService.js';

class VisitController {
    /**
     * Schedule a new visit.
     * Looks up existing lead by email/phone or creates a new one.
     */
    async scheduleVisit(req, res) {
        try {
            const {
                propertyId,
                unitId,
                name,
                email,
                phone,
                date,
                time,
                notes
            } = req.body;

            if (!propertyId || !name || !email || !date || !time) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Combine date and time
            const scheduledDate = new Date(`${date}T${time}`);

            // 1. Check if lead exists (logic typically resides in leadModel or we query lead table)
            // For now, we'll try to find a lead with this email or phone
            // Since leadModel.findAll returns all, we might need a specific findByEmail method
            // Or we just insert a new one if we don't have a perfect match system.
            // Let's create a new lead for every unique email, or find existing.

            // To be robust, let's just create a new lead or find one.
            // Simplified: Just use LeadModel.create which is what the user approved (Auto-create lead)
            // Ideally we check existence first to avoid duplicates, but LeadModel.create doesn't seem to enforce unique email in the provided code snippet (checked earlier).
            // However, typical systems should. Let's try to query first.

            const [existingLeads] = await db.query(
                `SELECT lead_id FROM leads WHERE email = ? LIMIT 1`,
                [email]
            );

            let leadId = null;
            if (existingLeads.length > 0) {
                leadId = existingLeads[0].lead_id;
            } else {
                // Create new lead
                leadId = await leadModel.create({
                    propertyId,
                    unitId, // Interest in specific unit
                    interestedUnit: unitId, // fallback
                    name,
                    phone,
                    email,
                    notes: `Auto-created via Schedule Visit`,
                    status: 'interested'
                });
            }

            // 2. Create Visit
            const visitId = await visitModel.create({
                propertyId,
                unitId,
                leadId,
                visitorName: name,
                visitorEmail: email,
                visitorPhone: phone,
                scheduledDate,
                notes
            });

            // 3. Send Notification to Owner
            try {
                // Fetch property details (includes owner_id)
                // We need to import propertyModel and userModel or use db query
                // For simplicity/speed, let's just query or access via existing helpers if available.
                // But controllers should ideally use models.
                // Let's bring in propertyModel and userModel imports at top of file, 
                // but since I can't easily add imports specific to this chunk without re-writing top,
                // I'll dynamically import or assume I'll add them in a separate step?
                // Better: Use direct db query for now or assume imports exist (I need to add them).
                // I will add imports in a separate 'replace' call or just use db.query since `db` is imported here.

                // Get Property & Owner details
                const [propRows] = await db.query(
                    `SELECT p.name as property_name, u.email as owner_email 
                     FROM properties p
                     JOIN users u ON p.owner_id = u.user_id
                     WHERE p.property_id = ?`,
                    [propertyId]
                );

                if (propRows.length > 0) {
                    const { property_name, owner_email } = propRows[0];

                    // Get unit number if applicable
                    let unit_number = null;
                    if (unitId) {
                        const [unitRows] = await db.query('SELECT unit_number FROM units WHERE unit_id = ?', [unitId]);
                        if (unitRows.length > 0) unit_number = unitRows[0].unit_number;
                    }

                    await emailService.sendVisitNotification(owner_email, {
                        visitorName: name,
                        visitorPhone: phone,
                        propertyName: property_name,
                        unitNumber: unit_number,
                        scheduledDate: scheduledDate,
                        notes: notes
                    });
                }

            } catch (emailError) {
                console.error("Failed to send visit notification:", emailError);
                // Non-blocking
            }

            res.status(201).json({
                message: 'Visit scheduled successfully',
                visitId,
                leadId
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
            // NOTE: Need to ensure req.user.id is the OWNER's ID. 
            // If RBAC is strict, make sure we filter correctly.

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

            if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status' });
            }

            const success = await visitModel.updateStatus(id, status);
            if (!success) {
                return res.status(404).json({ error: 'Visit not found' });
            }

            // Audit Log
            const auditLogger = (await import('../utils/auditLogger.js')).default;
            // req.user might not be present if public route? But updateStatus should be protected.
            // Assuming protected route (Owner/Staff).
            const userId = req.user ? req.user.id : null;
            await auditLogger.log({
                userId,
                actionType: 'VISIT_STATUS_UPDATED',
                entityId: id,
                details: { newStatus: status }
            }, req);

            res.json({ message: 'Visit status updated' });
        } catch (error) {
            console.error('Error updating visit status:', error);
            res.status(500).json({ error: 'Failed to update status' });
        }
    }
}

export default new VisitController();
