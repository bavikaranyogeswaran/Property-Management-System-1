
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
import { toCentsFromMajor } from '../utils/moneyUtils.js';

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

        // [HARDENED ANTI-SPAM] Content-Aware Deduplication
        const isDuplicate = await maintenanceRequestModel.findRecentDuplicate(unitId, tenantId, title, description);
        if (isDuplicate) {
             throw new Error('A maintenance request with this exact content was already submitted recently. Please wait a few minutes before trying again.');
        }

        // Flood Protection: Max 5 open requests per unit
        const openCount = await maintenanceRequestModel.countOpenByUnitId(unitId);
        if (openCount >= 5) {
            throw new Error('Maximum number of open maintenance requests (5) reached for this unit.');
        }

        const requestId = await maintenanceRequestModel.create({
            unitId,
            tenantId,
            title,
            description,
            priority,
            category: data.category || 'general',
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
        if (user.role !== 'owner' && user.role !== 'treasurer') {
             throw new Error('Only owners and treasurers can update status');
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const request = await maintenanceRequestModel.findById(id);
            if (!request) throw new Error('Request not found');

            // Treasurer RBAC: Check assigned property
            if (user.role === 'treasurer') {
                const unit = await unitModel.findById(request.unitId, connection);
                const staffModel = (await import('../models/staffModel.js')).default;
                const assigned = await staffModel.getAssignedProperties(user.id);
                const assignedPropertyIds = assigned.map((p) => p.property_id.toString());
                
                if (!assignedPropertyIds.includes(unit.propertyId.toString())) {
                    throw new Error('Access denied. You are not assigned to this property.');
                }
            }

            // State Machine Guardrails
            if (request.status === 'completed' || request.status === 'closed') {
                 if (status !== request.status) {
                     throw new Error(`Cannot update status of a ${request.status} request.`);
                 }
            }
            if (request.status === 'in_progress' && status === 'submitted') {
                 throw new Error('Cannot move a request backwards from in_progress to submitted.');
            }

            const updated = await maintenanceRequestModel.updateStatus(id, status);

            // [MAINTENANCE LOOP FIX] Automatically release unit status
            if (status === 'completed' || status === 'closed') {
                const openCount = await maintenanceRequestModel.countOpenByUnitId(request.unitId, connection);
                
                // If this request was just completed, we must ensure NO other submitted/in-progress ones exist
                if (openCount === 0) {
                    const unit = await unitModel.findById(request.unitId, connection);
                    
                    // Critical Guardrail: Only revert if the unit was specifically in 'maintenance' status
                    // This prevents accidentally marking an 'occupied' or 'reserved' unit as 'available'
                    if (unit && unit.status === 'maintenance') {
                         // [CRITICAL FIX] Avoid "Ghost Availability"
                         // Check if there's a future lease commitment before marking as 'available'
                         const [futureLeases] = await connection.query(
                             `SELECT COUNT(*) as count FROM leases 
                              WHERE unit_id = ? AND status IN ('active', 'pending', 'draft')
                              AND (start_date > CURRENT_DATE() OR (status = 'draft' AND (reservation_expires_at IS NULL OR reservation_expires_at >= CURRENT_DATE())))`,
                             [request.unitId]
                         );

                         const nextStatus = futureLeases[0].count > 0 ? 'reserved' : 'available';
                         await unitModel.update(request.unitId, { status: nextStatus }, connection);
                         console.log(`[MaintenanceService] Auto-released Unit ${unit.unitNumber} to '${nextStatus}' after repairs.`);
                    }
                }
            }

            await connection.commit();

            // Notification Logic (Async, outside transaction)
            if (status === 'completed' || status === 'in_progress') {
                try {
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

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async createInvoice(data, user) {
        if (user.role !== 'owner' && user.role !== 'treasurer') {
            throw new Error('Access denied');
        }

        const { requestId, amount, dueDate, description } = data;
        const request = await maintenanceRequestModel.findById(requestId);
        if (!request) throw new Error('Maintenance Request not found');

        const leases = await leaseModel.findByTenantId(request.tenantId);
        
        // Find most relevant lease (Active first, then recently ended/expired)
        let targetLease = leases.find(
            (l) => l.unitId === request.unitId.toString() && l.status === 'active'
        );

        if (!targetLease) {
            // Check for recently ended/expired leases (30-day grace period)
            const gracePeriodDays = 30;
            const graceDate = new Date();
            graceDate.setDate(graceDate.getDate() - gracePeriodDays);
            
            const recentLeases = leases
                .filter(l => l.unitId === request.unitId.toString() && (l.status === 'expired' || l.status === 'ended'))
                .filter(l => l.endDate && new Date(l.endDate) >= graceDate)
                .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
            
            if (recentLeases.length > 0) {
                targetLease = recentLeases[0];
            }
        }

        if (!targetLease) {
             throw new Error('No active or recently ended lease (within 30 days) found for this tenant/unit. Cannot invoice.');
        }

        const [unbilledCosts] = await pool.query(
            'SELECT cost_id, amount FROM maintenance_costs WHERE request_id = ? AND invoice_id IS NULL',
            [requestId]
        );

        if (unbilledCosts.length === 0) {
             throw new Error('No unbilled costs found for this maintenance request to invoice.');
        }

        const aggregatedTotalCents = unbilledCosts.reduce((sum, cost) => sum + Number(cost.amount), 0);
        const costIds = unbilledCosts.map(c => c.cost_id);

        let proposedDescription = description || `Maintenance Bill: ${request.title}`;
        const existingInvoices = await invoiceModel.findByLeaseAndDescription(
            targetLease.id,
            proposedDescription
        );

        if (existingInvoices.length > 0) {
            proposedDescription = `${proposedDescription} (${new Date().getTime()})`;
        }

        const invoiceId = await invoiceModel.create({
            leaseId: targetLease.id,
            amount: aggregatedTotalCents, // Native cents summation
            dueDate: dueDate || today(),
            description: proposedDescription,
            type: 'maintenance',
        });

        // Link all aggregated costs to this new invoice
        if (costIds.length > 0) {
            await pool.query('UPDATE maintenance_costs SET invoice_id = ?, is_reimbursable = TRUE WHERE cost_id IN (?)', [invoiceId, costIds]);
        }

        const displayAmountMajor = aggregatedTotalCents / 100;

        await notificationModel.create({
            userId: request.tenantId,
            message: `You have been billed ${displayAmountMajor} for maintenance: ${request.title}`,
            type: 'invoice',
        });

        // Notify Tenant via Email
        try {
            const tenant = await userModel.findById(request.tenantId);
            if (tenant && tenant.email) {
                const currentNow = now();
                await emailService.sendInvoiceNotification(tenant.email, {
                    amount: displayAmountMajor,
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

        const { requestId, amount, description, recordedDate, billTo } = data;
        const request = await maintenanceRequestModel.findById(requestId);
        if (!request) throw new Error('Maintenance Request not found');

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Record the cost
            const costId = await maintenanceCostModel.create({
                requestId,
                amount: toCentsFromMajor(amount),
                description,
                recordedDate: recordedDate || getLocalTime(),
                invoiceId: data.invoiceId || null,
                isReimbursable: data.isReimbursable || false,
                billTo: billTo || 'owner'
            }, connection);

            // 2. Identify lease to link ledger entry
            // [BILLING FIX] Same grace logic for recording costs
            const leases = await leaseModel.findByTenantId(request.tenantId);
            let targetLease = leases.find(
                (l) => l.unitId === request.unitId && l.status === 'active'
            );

            if (!targetLease) {
                const graceDate = new Date();
                graceDate.setDate(graceDate.getDate() - 30);
                const recentLeases = leases
                    .filter(l => l.unitId === request.unitId && (l.status === 'expired' || l.status === 'ended'))
                    .filter(l => l.endDate && new Date(l.endDate) >= graceDate)
                    .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
                
                if (recentLeases.length > 0) {
                    targetLease = recentLeases[0];
                }
            }

            if (targetLease) {
                // 3. Post to Ledger as an Expense
                await ledgerModel.create({
                    leaseId: targetLease.id,
                    accountType: 'expense',
                    category: 'maintenance_repair',
                    credit: toCentsFromMajor(amount), 
                    description: `Maintenance Cost: ${description || request.title} (Req #${requestId})`,
                    entryDate: recordedDate || getCurrentDateString(),
                }, connection);
            }

            const auditLogger = (await import('../utils/auditLogger.js')).default;
            await auditLogger.log({
                userId: user.id,
                actionType: 'MAINTENANCE_COST_RECORDED',
                entityId: requestId,
                details: { amount, description, costId }
            }, null, connection);

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
             return await maintenanceRequestModel.findByTreasurerId(user.id);
         } else {
             throw new Error('Access denied');
         }
    }
}

export default new MaintenanceService();
