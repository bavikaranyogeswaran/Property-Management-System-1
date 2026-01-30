
import visitModel from '../models/visitModel.js';
import leadModel from '../models/leadModel.js';
import db from '../config/db.js';

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
}

export default new VisitController();
