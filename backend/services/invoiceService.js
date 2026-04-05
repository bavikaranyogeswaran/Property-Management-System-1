
import db from '../config/db.js';
import invoiceModel from '../models/invoiceModel.js';
import leaseModel from '../models/leaseModel.js';
import staffModel from '../models/staffModel.js';
import paymentModel from '../models/paymentModel.js';
import paymentService from './paymentService.js';
import behaviorLogModel from '../models/behaviorLogModel.js';
import tenantModel from '../models/tenantModel.js';
import userModel from '../models/userModel.js';
import emailService from '../utils/emailService.js';
import billingEngine from '../utils/billingEngine.js';
import { getCurrentDateString, getLocalTime, parseLocalDate, now } from '../utils/dateUtils.js';

class InvoiceService {
    
    async getInvoices(user) {
        if (user.role === 'tenant') {
            return await invoiceModel.findByTenantId(user.id);
        } else if (user.role === 'treasurer') {
            return await invoiceModel.findByTreasurerId(user.id);
        } else if (user.role === 'owner') {
            return await invoiceModel.findByOwnerId(user.id);
        } else {
            throw new Error('Access denied');
        }
    }

    async createInvoice(data, user) {
        if (user.role !== 'treasurer') {
            throw new Error('Denied. Only Treasurers can create invoices.');
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // RBAC Check: Ensure treasurer is assigned to this property
            const lease = await leaseModel.findById(data.leaseId, connection);
            if (!lease) throw new Error('Lease not found');
            
            const staffModel = (await import('../models/staffModel.js')).default;
            const assigned = await staffModel.getAssignedProperties(user.id);
            const assignedPropertyIds = assigned.map((p) => p.id.toString());
            
            if (!assignedPropertyIds.includes(lease.propertyId.toString())) {
                throw new Error('Access denied. You are not assigned to this property.');
            }

            const invoiceId = await invoiceModel.create(data, connection);
            
            // 2. Auto-apply credit if exists (Participates in existing transaction)
            if (invoiceId) {
                await paymentService.applyTenantCredit(invoiceId, connection);
            }

            await connection.commit();

            // 3. Post-Commit Actions (Notifications)
            // Re-fetch to ensure we have the most accurate state for the email (e.g. if it's now 'paid')
            const finalInvoice = await invoiceModel.findById(invoiceId);
            const tenant = await userModel.findById(lease.tenantId);
            
            if (tenant && tenant.email) {
                const dueDate = parseLocalDate(data.dueDate);
                try {
                    await emailService.sendInvoiceNotification(tenant.email, {
                        amount: data.amount,
                        dueDate: data.dueDate,
                        month: dueDate.getMonth() + 1,
                        year: dueDate.getFullYear(),
                        invoiceId: invoiceId,
                        description: data.description,
                        isPaid: finalInvoice.status === 'paid'
                    });
                } catch (emailErr) {
                    console.error('[InvoiceService] Failed to send invoice notification email:', emailErr);
                }
            }

            return invoiceId;

        } catch (error) {
            await connection.rollback();
            console.error('[InvoiceService] Create Invoice Transaction Failed:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    async generateMonthlyInvoices(year, month, user) {
        if (user.role !== 'treasurer') {
            throw new Error('Access denied. Only Treasurers can generate invoices.');
        }

        const nowTime = getLocalTime();
        const y = year || nowTime.getFullYear();
        const m = month || nowTime.getMonth() + 1;

        // 1. CONCURRENCY LOCK: Prevent multiple simultaneous bulk generations
        const lockName = `generate_invoices_${y}_${m}`;
        const [existingLock] = await db.query(
            "SELECT status, updated_at FROM cron_checkpoints WHERE job_name = ? LIMIT 1",
            [lockName]
        );

        if (existingLock.length > 0) {
            const lastUpdate = new Date(existingLock[0].updated_at);
            const diffMinutes = (new Date().getTime() - lastUpdate.getTime()) / (1000 * 60);

            if (existingLock[0].status === 'running' && diffMinutes < 15) {
                throw new Error('Invoice generation for this period is already in progress. Please wait.');
            }
            
            // Rate Limit: Prevent regeneration if successful within last 5 minutes
            if (existingLock[0].status === 'success' && diffMinutes < 5) {
                throw new Error('Invoice generation was recently completed. Please wait 5 minutes before re-running.');
            }
        }

        // Set/Reset Lock to Running
        await db.query(
            `INSERT INTO cron_checkpoints (job_name, last_success_date, status, message) 
             VALUES (?, ?, 'running', 'Manual generation started')
             ON DUPLICATE KEY UPDATE status = 'running', updated_at = NOW(), message = 'Manual generation re-started'`,
            [lockName, `${y}-${String(m).padStart(2, '0')}-01`]
        );

        try {
            const activeLeases = await leaseModel.findActive();

            // RBAC: Treasurer assignments
            const assigned = await staffModel.getAssignedProperties(user.id);
            const assignedPropertyIds = assigned.map((p) => p.property_id.toString());
            const targetLeases = activeLeases.filter((l) =>
                assignedPropertyIds.includes(l.propertyId.toString())
            );

            let generatedCount = 0;
            let skippedCount = 0;

            for (const lease of targetLeases) {
                const leaseStart = parseLocalDate(lease.startDate);
                leaseStart.setHours(0, 0, 0, 0);

                const targetMonthStart = parseLocalDate(`${y}-${String(m).padStart(2, '0')}-01`);
                targetMonthStart.setHours(0, 0, 0, 0);

                if (leaseStart > targetMonthStart) {
                    skippedCount++;
                    continue;
                }

                const exists = await invoiceModel.exists(lease.id, y, m);
                if (exists) {
                    skippedCount++;
                    continue;
                }

                const billingInfo = billingEngine.calculateMonthlyRent(lease, y, m);
                if (!billingInfo) {
                    skippedCount++;
                    continue;
                }

                const invoiceId = await invoiceModel.create({
                    leaseId: lease.id,
                    amount: billingInfo.amount,
                    dueDate: billingInfo.dueDate,
                    description: billingInfo.description,
                });

                // Auto-apply credit if exists
                try {
                    await paymentService.applyTenantCredit(invoiceId);
                } catch (err) {
                    console.error(`[InvoiceService] Failed to auto-apply credit to generated invoice ${invoiceId}:`, err);
                }

                // Notify Tenant via Email
                try {
                    const tenant = await userModel.findById(lease.tenantId);
                    if (tenant && tenant.email) {
                        await emailService.sendInvoiceNotification(tenant.email, {
                            amount: billingInfo.amount,
                            dueDate: billingInfo.dueDate,
                            month: m,
                            year: y,
                            invoiceId: invoiceId,
                        });
                    }
                } catch (err) {
                    console.error(`Failed to send email for invoice ${invoiceId}:`, err);
                }

                generatedCount++;
            }

            // 3. RELEASE LOCK: Mark as successful
            await db.query(
                "UPDATE cron_checkpoints SET status = 'success', message = ?, updated_at = NOW() WHERE job_name = ?",
                [`Generated ${generatedCount} invoices manually`, lockName]
            );

            return { generated: generatedCount, skipped: skippedCount };
        } catch (err) {
            // Handle Error Release
            await db.query(
                "UPDATE cron_checkpoints SET status = 'failed', message = ?, updated_at = NOW() WHERE job_name = ?",
                [err.message, lockName]
            );
            throw err;
        }
    }

    async updateStatus(id, status, user) {
        if (user.role !== 'treasurer') {
            throw new Error('Access denied. Only Treasurers can update invoice status.');
        }

        const invoice = await invoiceModel.findById(id);
        if (!invoice) throw new Error('Invoice not found');
        
        // RBAC Check: Ensure treasurer is assigned to this property
        const lease = await leaseModel.findById(invoice.leaseId);
        if (!lease) throw new Error('Lease not found');

        const assigned = await staffModel.getAssignedProperties(user.id);
        const assignedPropertyIds = assigned.map((p) => p.id.toString());
        if (!assignedPropertyIds.includes(lease.propertyId.toString())) {
            throw new Error('Access denied. You are not assigned to this property.');
        }

        const oldStatus = invoice.status;

        if (status === 'overdue') {
            const dueDate = parseLocalDate(invoice.due_date);
            const currentToday = now();
            currentToday.setHours(0, 0, 0, 0);
            dueDate.setHours(0, 0, 0, 0);

            if (currentToday <= dueDate) {
                throw new Error('Cannot mark invoice as overdue before the due date.');
            }

            const payments = await paymentModel.findByInvoiceId(id);
            const pendingPayments = payments.filter((p) => p.status === 'pending');
            if (pendingPayments.length > 0) {
                throw new Error('Cannot mark as overdue. A payment is pending verification.');
            }
        }

        const updatedInvoice = await invoiceModel.updateStatus(id, status);
        
        // Logic Fix: If it's a deposit invoice being paid, update the Lease's deposit_status.
        if (status === 'paid' && invoice.invoice_type === 'deposit') {
             await leaseModel.update(invoice.lease_id, {
                 depositStatus: 'paid',
             });
        }

        // Scoring Logic
        if (status === 'overdue' && oldStatus !== 'overdue') {
            try {
                const scoreChange = -10;
                await behaviorLogModel.create({
                    tenantId: invoice.tenant_id,
                    type: 'negative',
                    category: 'Payment',
                    scoreChange: scoreChange,
                    description: `Invoice #${id} marked as overdue.`,
                    recordedBy: user.id,
                });
                await tenantModel.incrementBehaviorScore(invoice.tenant_id, scoreChange);
            } catch (err) {
                console.error('Failed to update behavior score:', err);
            }
        }

        return updatedInvoice;
    }
}

export default new InvoiceService();
