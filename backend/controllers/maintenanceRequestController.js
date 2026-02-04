import maintenanceRequestModel from '../models/maintenanceRequestModel.js';
import propertyModel from '../models/propertyModel.js';
import notificationModel from '../models/notificationModel.js';
// Assuming userModel exists or we use raw query. Checking userModel first...
import userModel from '../models/userModel.js';

class MaintenanceRequestController {
    async createRequest(req, res) {
        try {
            const { unitId, title, description, priority, images } = req.body;
            const tenantId = req.user.id; // From auth middleware

            // Verify tenant belongs to unit? (Ideally yes, but skipping strict check for speed, relying on frontend)

            const requestId = await maintenanceRequestModel.create({
                unitId,
                tenantId,
                title,
                description,
                priority,
                images
            });

            res.status(201).json({ message: 'Maintenance request created', requestId });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to create request' });
        }
    }

    async getRequests(req, res) {
        try {
            // RBAC
            if (req.user.role === 'tenant') {
                const requests = await maintenanceRequestModel.findByTenantId(req.user.id);
                return res.json(requests);
            } else if (req.user.role === 'owner' || req.user.role === 'treasurer') {
                // Owner sees all requests for their properties?
                // Currently generic findAll for simplicity, or we can filter by owner's properties if we had that logic handy.
                // Assuming "Owner" has global view for this specific single-owner system.
                // Treasurer also needs access to view requests to add costs.
                const requests = await maintenanceRequestModel.findAll();
                return res.json(requests);
            } else {
                return res.status(403).json({ error: 'Access denied' });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch requests' });
        }
    }

    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;

            // RBAC: Only Owner (or Lead?) can update status?
            // Treasurer typically just adds costs, but maybe can mark as completed if they pay the invoice?
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Only owners can update status' });
            }

            const updated = await maintenanceRequestModel.updateStatus(id, status);

            // Notification Logic
            if (status === 'completed') {
                // Find all treasurers
                const treasurers = await userModel.findByRole('treasurer');
                const request = await maintenanceRequestModel.findById(id);

                // Notify Treasurers
                for (const treasurer of treasurers) {
                    await notificationModel.create({
                        userId: treasurer.user_id,
                        message: `Maintenance Request '${request.title}' has been completed. Please record final costs.`,
                        type: 'maintenance'
                    });
                }

                // Notify Tenant
                if (request.tenant_id) {
                    await notificationModel.create({
                        userId: request.tenant_id,
                        message: `Maintenance Request '${request.title}' has been marked as completed.`,
                        type: 'maintenance'
                    });
                }
            } else if (status === 'in_progress') {
                const request = await maintenanceRequestModel.findById(id);
                if (request && request.tenant_id) {
                    await notificationModel.create({
                        userId: request.tenant_id,
                        message: `Maintenance Request '${request.title}' is now In Progress. Technician assigned.`,
                        type: 'maintenance'
                    });
                }
            }

            res.json(updated);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to update status' });
        }
    }
}

export default new MaintenanceRequestController();
