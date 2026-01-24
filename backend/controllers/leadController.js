import userService from '../services/userService.js';
import leadModel from '../models/leadModel.js';
import db from '../config/db.js';

class LeadController {
    async convertLead(req, res) {
        try {
            // Check if user is owner (RBAC)
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied. Only Owners can convert leads.' });
            }

            const { id } = req.params;
            const { password } = req.body;

            if (!password || password.length < 8) {
                return res.status(400).json({ error: 'Password must be at least 8 characters long' });
            }

            const result = await userService.convertLeadToTenant(id, password);
            res.status(200).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async getLeads(req, res) {
        try {
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied.' });
            }
            const leads = await leadModel.findAll();
            res.json(leads);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async createLead(req, res) {
        try {
            // Public endpoint - no role check needed

            const { name, email, phone, propertyId, interestedUnit, unitId } = req.body;
            if (!name || !email || !phone || !propertyId) {
                return res.status(400).json({ error: 'Name, email, phone and property are required' });
            }

            // Basic email validation regex
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ error: 'Invalid email format' });
            }

            // STRICT VALIDATION: Check if unit belongs to property
            let finalUnitId = unitId || interestedUnit;
            if (finalUnitId && finalUnitId !== '' && finalUnitId !== 'null') {
                const [unitCheck] = await db.query(
                    'SELECT property_id FROM units WHERE unit_id = ?',
                    [finalUnitId]
                );

                if (unitCheck.length === 0) {
                    return res.status(400).json({ error: 'Invalid unit selected' });
                }

                if (String(unitCheck[0].property_id) !== String(propertyId)) {
                    return res.status(400).json({ error: 'Selected unit does not belong to the specified property' });
                }
            }

            const leadId = await leadModel.create(req.body);
            res.status(201).json({ id: leadId, message: 'Lead created successfully' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async updateLead(req, res) {
        try {
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied.' });
            }
            const { id } = req.params;
            const success = await leadModel.update(id, req.body);
            if (!success) {
                return res.status(404).json({ error: 'Lead not found' });
            }
            res.json({ message: 'Lead updated successfully' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

export default new LeadController();
