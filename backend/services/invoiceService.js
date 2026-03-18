
import invoiceModel from '../models/invoiceModel.js';
import leaseModel from '../models/leaseModel.js';
import staffModel from '../models/staffModel.js';
import paymentModel from '../models/paymentModel.js';
import behaviorLogModel from '../models/behaviorLogModel.js';
import tenantModel from '../models/tenantModel.js';
import userModel from '../models/userModel.js';
import emailService from '../utils/emailService.js';

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
        const invoiceId = await invoiceModel.create(data);
        
        // Notify Tenant via Email
        try {
            const lease = await leaseModel.findById(data.leaseId);
            if (lease) {
                const tenant = await userModel.findById(lease.tenantId);
                if (tenant && tenant.email) {
                    const dueDate = new Date(data.dueDate);
                    await emailService.sendInvoiceNotification(tenant.email, {
                        amount: data.amount,
                        dueDate: data.dueDate,
                        month: dueDate.getMonth() + 1,
                        year: dueDate.getFullYear(),
                        invoiceId: invoiceId,
                        description: data.description
                    });
                }
            }
        } catch (err) {
            console.error('Failed to send manual invoice email:', err);
        }

        return invoiceId;
    }

    async generateMonthlyInvoices(year, month, user) {
        if (user.role !== 'treasurer') {
            throw new Error('Access denied. Only Treasurers can generate invoices.');
        }

        const now = new Date();
        const y = year || now.getFullYear();
        const m = month || now.getMonth() + 1;

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
            const leaseStart = new Date(lease.startDate);
            leaseStart.setHours(0, 0, 0, 0);

            const targetMonthStart = new Date(y, m - 1, 1);
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

            const dueDate = new Date(y, m - 1, 5);
            const dueDateStr = dueDate.toISOString().split('T')[0];

            const invoiceId = await invoiceModel.create({
                leaseId: lease.id,
                amount: lease.monthlyRent,
                dueDate: dueDateStr,
                description: `Rent for ${y}-${m}`,
            });

            // Notify Tenant via Email
            try {
                const tenant = await userModel.findById(lease.tenantId);
                if (tenant && tenant.email) {
                    await emailService.sendInvoiceNotification(tenant.email, {
                        amount: lease.monthlyRent,
                        dueDate: dueDateStr,
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

        return { generated: generatedCount, skipped: skippedCount };
    }

    async updateStatus(id, status, user) {
        if (user.role !== 'treasurer') {
            throw new Error('Access denied. Only Treasurers can update invoice status.');
        }

        const invoice = await invoiceModel.findById(id);
        if (!invoice) throw new Error('Invoice not found');
        const oldStatus = invoice.status;

        if (status === 'overdue') {
            const dueDate = new Date(invoice.due_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            dueDate.setHours(0, 0, 0, 0);

            if (today <= dueDate) {
                throw new Error('Cannot mark invoice as overdue before the due date.');
            }

            const payments = await paymentModel.findByInvoiceId(id);
            const pendingPayments = payments.filter((p) => p.status === 'pending');
            if (pendingPayments.length > 0) {
                throw new Error('Cannot mark as overdue. A payment is pending verification.');
            }
        }

        const updatedInvoice = await invoiceModel.updateStatus(id, status);
        
        // Logic Fix: If it's a deposit invoice being paid, update the Lease's security_deposit column.
        if (status === 'paid' && invoice.invoice_type === 'deposit') {
             // We need to mirror the logic in paymentService.js
             const lease = await leaseModel.findById(invoice.lease_id);
             if (lease) {
                 const newHeld = Number(lease.securityDeposit || 0) + Number(invoice.amount);
                 await leaseModel.update(invoice.lease_id, {
                     deposit_status: 'paid',
                     security_deposit: newHeld
                 });
             }
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
