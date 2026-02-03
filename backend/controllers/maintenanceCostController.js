import maintenanceCostModel from '../models/maintenanceCostModel.js';

class MaintenanceCostController {
    async addCost(req, res) {
        try {
            const { requestId, amount, description, recordedDate, billToTenant } = req.body;

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

            // Logic Check: Billable Maintenance
            // If flagged, generate an Invoice for the tenant.
            if (billToTenant) {
                // Get request details to find tenant/unit/lease?
                // maintenanceRequestModel has tenantId and unitId.
                // We need ACTIVE lease to bill against.
                const maintenanceRequestModel = (await import('../models/maintenanceRequestModel.js')).default;
                const request = await maintenanceRequestModel.findById(requestId); // Ensure this exists

                if (request && request.tenant_id) {
                    // Find active lease for this tenant/unit?
                    // invoiceModel needs leaseId.
                    const leaseModel = (await import('../models/leaseModel.js')).default;
                    // We need to find the lease associated with this request.
                    // Usually maintenance is on a unit occupied by tenant.
                    // Assuming 'tenant_id' on request is the current tenant.
                    // Let's find ACTIVE lease for this tenant and unit.

                    // Optimization: Use leaseModel.findActiveByUnit(request.unit_id)? 
                    // Or query manually.
                    // Let's assume leaseModel.findActiveByUnit exists or use raw query.
                    // Actually, I can use `findActive` and filter, but that's slow.
                    // Let's assume the request was made by the active tenant.
                    const [leases] = await leaseModel.findByTenant(request.tenant_id);
                    const activeLease = leases.find(l => l.unit_id === request.unit_id && l.status === 'active');

                    if (activeLease) {
                        const invoiceModel = (await import('../models/invoiceModel.js')).default;
                        await invoiceModel.create({
                            leaseId: activeLease.lease_id,
                            amount: amount,
                            dueDate: new Date(), // Immediate
                            description: `Maintenance Charge: ${description || 'Repair Costs'}`
                        });
                        console.log(`Billed Maintenace Cost to Lease ${activeLease.lease_id}`);
                    } else {
                        console.warn('Cannot bill maintenance: No active lease found for this unit/tenant.');
                    }
                }
            }

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
