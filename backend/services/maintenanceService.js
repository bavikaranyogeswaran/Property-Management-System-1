
import maintenanceRequestModel from '../models/maintenanceRequestModel.js';
import propertyModel from '../models/propertyModel.js';
import notificationModel from '../models/notificationModel.js';
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import invoiceModel from '../models/invoiceModel.js';
import userModel from '../models/userModel.js';
import emailService from '../utils/emailService.js';
import maintenanceCostModel from '../models/maintenanceCostModel.js';
import ledgerModel from '../models/ledgerModel.js';
import pool from '../config/db.js';
import { getCurrentDateString, getLocalTime, today, now } from '../utils/dateUtils.js';

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
                if (property && property.ownerId) {
                    await notificationModel.create({
                        userId: property.ownerId,
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
        if (status === 'completed' || status === 'in_progress') {
            try {
                const request = await maintenanceRequestModel.findById(id);
                if (request && request.tenant_id) {
                    // Internal Notification
                    await notificationModel.create({
                        userId: request.tenant_id,
                        message: status === 'completed' 
                            ? `Maintenance Request '${request.title}' has been marked as completed.`
                            : `Maintenance Request '${request.title}' is now In Progress. Technician assigned.`,
                        type: 'maintenance',
                    });

                    // Email Notification
                    const tenant = await userModel.findById(request.tenant_id);
                    if (tenant && tenant.email) {
                        const unit = await unitModel.findById(request.unitId);
                        const property = unit ? await propertyModel.findById(unit.propertyId) : null;
                        
                        await emailService.sendMaintenanceStatusUpdate(tenant.email, {
                            title: request.title,
                            status: status,
                            propertyName: property ? property.name : null,
                            unitNumber: unit ? unit.unitNumber : null
                        });
                    }
                }

                // If completed, also notify treasurers
                if (status === 'completed') {
                    const treasurers = await userModel.findByRole('treasurer');
                    for (const treasurer of treasurers) {
                        await notificationModel.create({
                            userId: treasurer.user_id,
                            message: `Maintenance Request '${request.title}' has been completed. Please record final costs.`,
                            type: 'maintenance',
                        });
                    }
                }
            } catch (err) {
                console.error('Failed to send maintenance status update notifications:', err);
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
            dueDate: dueDate || today(),
            description: proposedDescription,
            type: 'maintenance',
        });

        await notificationModel.create({
            userId: request.tenant_id,
            message: `You have been billed ${amount} for maintenance: ${request.title}`,
            type: 'invoice',
        });

        // Notify Tenant via Email
        try {
            const tenant = await userModel.findById(request.tenant_id);
            if (tenant && tenant.email) {
                const currentNow = now();
                await emailService.sendInvoiceNotification(tenant.email, {
                    amount,
                    dueDate: dueDate || today(),
                    month: currentNow.getMonth() + 1,
                    year: currentNow.getFullYear(),
                    invoiceId: invoiceId,
                    description: proposedDescription
                });
            }
        } catch (err) {
            console.error('Failed to send maintenance invoice email:', err);
        }

        return invoiceId;
    }
    
    async recordCost(data, user) {
        if (user.role !== 'owner' && user.role !== 'treasurer') {
            throw new Error('Access denied');
        }

        const { requestId, amount, description, recordedDate } = data;
        const request = await maintenanceRequestModel.findById(requestId);
        if (!request) throw new Error('Maintenance Request not found');

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Record the cost
            const costId = await maintenanceCostModel.create({
                requestId,
                amount,
                description,
                recordedDate: recordedDate || getLocalTime()
            }, connection);

            // 2. Identify lease to link ledger entry
            // Note: If no active lease, we might link to property or use special ID, 
            // but for accounting integrity, we prefer linking to a lease if possible.
            const leases = await leaseModel.findByTenantId(request.tenantId);
            const activeLease = leases.find(
                (l) => l.unitId === request.unitId && l.status === 'active'
            );

            if (activeLease) {
                // 3. Post to Ledger as an Expense
                await ledgerModel.create({
                    leaseId: activeLease.id,
                    accountType: 'expense',
                    category: 'maintenance_repair',
                    credit: Number(amount), // In our system, expenses increase with CREDIT (payments made by owner) 
                    // Wait, let's check ledgerModel.js logic again. 
                    // summary[name].expense += Number(row.total_credit) - Number(row.total_debit);
                    // Yes, expenses are treated as positive credits in the summary.
                    description: `Maintenance Cost: ${description || request.title} (Req #${requestId})`,
                    entryDate: recordedDate || getCurrentDateString(),
                }, connection);
            }

            await connection.commit();
            return costId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
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
             const unitIds = [...new Set(results.map(r => r.unitId))];
             
             // Find properties for these units
             if (unitIds.length === 0) return [];
             const units = await Promise.all(unitIds.map(id => unitModel.findById(id)));
             const unitIdToPropertyId = {};
             units.forEach(u => {
                 if (u) unitIdToPropertyId[u.id] = u.propertyId.toString();
             });
             
             console.log('Treasurer assignedPropertyIds:', assignedPropertyIds);
             console.log('Treasurer unitIdToPropertyId:', unitIdToPropertyId);

             return results.filter((r) => {
                 const propId = unitIdToPropertyId[r.unitId];
                 console.log(`Checking request ${r.id} for unit ${r.unitId} -> propId: ${propId}`);
                 return assignedPropertyIds.includes(propId);
             });
         } else {
             throw new Error('Access denied');
         }
    }
}

export default new MaintenanceService();
