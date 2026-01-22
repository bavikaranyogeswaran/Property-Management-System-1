import userService from '../services/userService.js';
import leadModel from '../models/leadModel.js';

class LeadController {
    async convertLead(req, res) {
        try {
            // Check if user is owner (RBAC)
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied. Only Owners can convert leads.' });
            }

            const { id } = req.params;
            const result = await userService.convertLeadToTenant(id);
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
            // Anyone can create a lead? Or only owner?
            // Usually valid for public inquiries too, but let's assume auth required for now based on app structure
            // If public, we wouldn't check req.user.role.
            // But LeadsPage is for Owners.
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied.' });
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
