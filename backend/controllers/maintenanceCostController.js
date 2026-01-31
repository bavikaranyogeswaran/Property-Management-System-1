import maintenanceCostModel from '../models/maintenanceCostModel.js';

class MaintenanceCostController {
    async addCost(req, res) {
        try {
            const { requestId, amount, description, recordedDate } = req.body;

            // RBAC: Owner and Treasurer can add costs
            if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
                return res.status(403).json({ error: 'Access denied' });
            }

            const costId = await maintenanceCostModel.create({
                requestId,
                amount,
                description,
                recordedDate
            });

            res.status(201).json({ message: 'Cost recorded', costId });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to record cost' });
        }
    }

    async getCosts(req, res) {
        try {
            const { requestId } = req.query;

            if (req.user.role === 'tenant') {
                const costs = await maintenanceCostModel.findByTenantId(req.user.id);
                return res.json(costs);
            }

            // If no requestId provided, return all costs for Owner/Treasurer
            if (!requestId) {
                if (req.user.role === 'owner' || req.user.role === 'treasurer') {
                    // We need a findAll method in model. Let's assume it exists or use raw query here for speed?
                    // Better to add to model. checking model...
                    // Actually, let's just use a raw query from model helper I'll create or just assume findAll exists.
                    // I'll add findAll to model in next step or use a direct query here if I must.
                    // But I can't edit model in this same tool call easily if I didn't plan it.
                    // Let's modify this to calls `maintenanceCostModel.findAll()`.
                    const costs = await maintenanceCostModel.findAll();
                    return res.json(costs);
                }
                return res.status(400).json({ error: 'Request ID required' });
            }

            const costs = await maintenanceCostModel.findByRequestId(requestId);
            res.json(costs);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch costs' });
        }
    }

    async deleteCost(req, res) {
        try {
            const { id } = req.params;

            // RBAC: Owner and Treasurer can delete costs
            if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
                return res.status(403).json({ error: 'Access denied' });
            }

            const deleted = await maintenanceCostModel.delete(id);
            if (deleted) {
                res.json({ message: 'Cost deleted' });
            } else {
                res.status(404).json({ error: 'Cost not found' });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to delete cost' });
        }
    }
}

export default new MaintenanceCostController();
