
import maintenanceRequestModel from '../models/maintenanceRequestModel.js';
import propertyModel from '../models/propertyModel.js';
import notificationModel from '../models/notificationModel.js';
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import invoiceModel from '../models/invoiceModel.js';
import userModel from '../models/userModel.js';

class MaintenanceService {

    async createRequest(data, tenantId) {
        const { unitId, title, description, priority, images } = data;

        // RBAC/Security: Verify tenant currently LEASES this unit
        const tenantLeases = await leaseModel.findByTenantId(tenantId);
        const isLeased = tenantLeases.some(
            (l) => l.unitId === unitId.toString() && l.status === 'active'
        );

        if (!isLeased) {
            throw new Error('Access denied. You do not have an active lease for this unit.');
        }

        const requestId = await maintenanceRequestModel.create({
            unitId,
            tenantId,
            title,
            description,
            priority,
            images,
        });

        // Notify Owner
        try {
            const unit = await unitModel.findById(unitId);
            if (unit && unit.propertyId) {
                const property = await propertyModel.findById(unit.propertyId);
                if (property && property.owner_id) {
                    await notificationModel.create({
                        userId: property.owner_id,
                        message: `New Maintenance Request for Unit ${unit.unitNumber}: ${title}`,
                        type: 'maintenance',
                        severity: 'warning',
                    });
                }
            }
        } catch (notifyErr) {
            console.error('Failed to notify owner of maintenance request:', notifyErr);
        }

        return requestId;
    }

    async updateStatus(id, status, user) {
        if (user.role !== 'owner') {
             throw new Error('Only owners can update status');
        }

        const updated = await maintenanceRequestModel.updateStatus(id, status);

        // Notification Logic
        if (status === 'completed') {
            const treasurers = await userModel.findByRole('treasurer');
            const request = await maintenanceRequestModel.findById(id);

            for (const treasurer of treasurers) {
                await notificationModel.create({
                    userId: treasurer.user_id,
                    message: `Maintenance Request '${request.title}' has been completed. Please record final costs.`,
                    type: 'maintenance',
                });
            }

            if (request.tenant_id) {
                await notificationModel.create({
                    userId: request.tenant_id,
                    message: `Maintenance Request '${request.title}' has been marked as completed.`,
                    type: 'maintenance',
                });
            }
        } else if (status === 'in_progress') {
             const request = await maintenanceRequestModel.findById(id);
             if (request && request.tenant_id) {
                 await notificationModel.create({
                     userId: request.tenant_id,
                     message: `Maintenance Request '${request.title}' is now In Progress. Technician assigned.`,
                     type: 'maintenance',
                 });
             }
        }
        return updated;
    }

    async createInvoice(data, user) {
        if (user.role !== 'owner' && user.role !== 'treasurer') {
            throw new Error('Access denied');
        }

        const { requestId, amount, dueDate, description } = data;
        const request = await maintenanceRequestModel.findById(requestId);
        if (!request) throw new Error('Maintenance Request not found');

        const leases = await leaseModel.findByTenantId(request.tenant_id);
        const activeLease = leases.find(
            (l) => l.unitId === request.unit_id.toString() && l.status === 'active'
        );

        if (!activeLease) {
             throw new Error('No active lease found for this tenant/unit. Cannot invoice.');
        }

        const proposedDescription = description || `Maintenance Bill: ${request.title}`;
        const existingInvoices = await invoiceModel.findByLeaseAndDescription(
            activeLease.id,
            proposedDescription
        );

        if (existingInvoices.length > 0) {
            throw new Error('An invoice for this maintenance request already exists.');
        }

        const invoiceId = await invoiceModel.create({
            leaseId: activeLease.id,
            amount,
            dueDate: dueDate || new Date(),
            description: proposedDescription,
            type: 'maintenance',
        });

        await notificationModel.create({
            userId: request.tenant_id,
            message: `You have been billed ${amount} for maintenance: ${request.title}`,
            type: 'invoice',
        });

        return invoiceId;
    }
    
    async getRequests(user) {
         if (user.role === 'tenant') {
             return await maintenanceRequestModel.findByTenantId(user.id);
         } else if (user.role === 'owner') {
             return await maintenanceRequestModel.findByOwnerId(user.id);
         } else if (user.role === 'treasurer') {
             const results = await maintenanceRequestModel.findAll();
             // Filter by assigned properties
             const staffModel = (await import('../models/staffModel.js')).default;
             const assigned = await staffModel.getAssignedProperties(user.id);
             const assignedPropertyIds = assigned.map((p) => p.property_id.toString());
             
             // Extract unique unit IDs from the requests
             const unitIds = [...new Set(results.map(r => r.unit_id))];
             
             // Find properties for these units
             if (unitIds.length === 0) return [];
             const units = await Promise.all(unitIds.map(id => unitModel.findById(id)));
             const unitIdToPropertyId = {};
             units.forEach(u => {
                 if(u) unitIdToPropertyId[u.unit_id] = u.propertyId.toString();
             });
             
             return results.filter((r) => {
                 const propId = unitIdToPropertyId[r.unit_id];
                 return assignedPropertyIds.includes(propId);
             });
         } else {
             throw new Error('Access denied');
         }
    }
}

export default new MaintenanceService();
