import leaseModel from '../models/leaseModel.js';

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
}

export default new LeaseController();
