import leaseModel from '../models/leaseModel.js';
import unitModel from '../models/unitModel.js';

class LeaseController {
    async getLeases(req, res) {
        try {
            // RBAC: Owner sees all, Tenant sees their own?
            // Currently assuming Owner use case or generic fetch
            // But strict RBAC is good.
            if (req.user.role === 'owner' || req.user.role === 'treasurer') {
                const results = await leaseModel.findAll();
                res.json(results);
            } else if (req.user.role === 'tenant') {
                const results = await leaseModel.findByTenantId(req.user.id);
                res.json(results);
            } else {
                res.status(403).json({ error: 'Access denied' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getLeaseById(req, res) {
        try {
            const { id } = req.params;
            const lease = await leaseModel.findById(id);
            if (!lease) {
                return res.status(404).json({ error: 'Lease not found' });
            }

            // RBAC check
            if (req.user.role !== 'owner' &&
                req.user.role !== 'treasurer' &&
                (req.user.role === 'tenant' && lease.tenantId !== req.user.id.toString())) {
                return res.status(403).json({ error: 'Access denied' });
            }

            res.json(lease);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async createLease(req, res) {
        try {
            if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
                return res.status(403).json({ error: 'Access denied.' });
            }

            const { tenantId, unitId, startDate, endDate, monthlyRent } = req.body;

            if (!tenantId || !unitId || !startDate || !endDate || !monthlyRent) {
                return res.status(400).json({ error: 'All fields are required' });
            }

            // Check if unit is available
            const unit = await unitModel.findById(unitId);
            if (!unit) {
                return res.status(404).json({ error: 'Unit not found' });
            }
            if (unit.status === 'occupied') {
                return res.status(400).json({ error: 'Unit is already occupied' });
            }

            const leaseId = await leaseModel.create({
                tenantId,
                unitId,
                startDate,
                endDate,
                monthlyRent,
                status: 'active'
            });

            // Mark unit as occupied
            await unitModel.update(unitId, { status: 'occupied' });

            res.status(201).json({ id: leaseId, message: 'Lease created successfully' });
        } catch (error) {
            console.error("Create Lease Error:", error);
            res.status(500).json({ error: error.message });
        }
    }
}

export default new LeaseController();
