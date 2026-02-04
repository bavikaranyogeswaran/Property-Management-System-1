import paymentModel from '../models/paymentModel.js';
import invoiceModel from '../models/invoiceModel.js';
import notificationModel from '../models/notificationModel.js';
import userModel from '../models/userModel.js';
import receiptModel from '../models/receiptModel.js';
import notificationModel from '../models/notificationModel.js';

class PaymentController {
    async submitPayment(req, res) {
        try {
            const { invoiceId, amount, paymentDate, paymentMethod, referenceNumber, evidenceUrl } = req.body;
            const tenantId = req.user.id;

            // Integrity Check: Is invoice already paid?
            const invoice = await invoiceModel.findById(invoiceId);
            if (!invoice) {
                return res.status(404).json({ error: 'Invoice not found' });
            }
            if (invoice.status === 'paid') {
                return res.status(400).json({ error: 'This invoice has already been paid.' });
            }

            const paymentId = await paymentModel.create({
                invoiceId,
                amount,
                paymentDate,
                paymentMethod,
                referenceNumber,
                evidenceUrl
            });

            // Notify Treasurers
            try {
                const treasurers = await userModel.findByRole('treasurer');
                // Optimally we'd filter by property assignment here, but broadcast is safe for now.
                for (const t of treasurers) {
                    await notificationModel.create({
                        userId: t.user_id,
                        message: `New Payment submitted for Invoice #${invoiceId} (Amount: ${amount}).`,
                        type: 'payment'
                    });
                }
            } catch (noteErr) {
                console.error('Failed to notify treasurers', noteErr);
            }

            // Status remains 'pending' until treasurer verifies
            res.status(201).json({ message: 'Payment submitted for verification', paymentId });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to submit payment' });
        }
    }

    async recordCashPayment(req, res) {
        try {
            if (req.user.role !== 'treasurer') {
                return res.status(403).json({ error: 'Access denied. Only Treasurers can record cash payments.' });
            }

            const { invoiceId, amount, paymentDate, referenceNumber } = req.body;

            // Create Verified Payment directly
            const paymentId = await paymentModel.create({
                invoiceId,
                amount,
                paymentDate,
                paymentMethod: 'cash',
                referenceNumber: referenceNumber || `CASH-${Date.now()}`,
                evidenceUrl: null // No proof for cash
            });

            // Auto-verify
            await paymentModel.updateStatus(paymentId, 'verified');

            // Mark Invoice as Paid
            await invoiceModel.updateStatus(invoiceId, 'paid');

            // Find invoice to get tenant details for Receipt
            const invoice = await invoiceModel.findById(invoiceId);

            // Generate Receipt
            if (invoice) {
                await receiptModel.create({
                    paymentId,
                    invoiceId,
                    tenantId: invoice.tenant_id,
                    amount,
                    generatedDate: new Date().toISOString(),
                    receiptNumber: `REC-CASH-${Date.now()}`
                });

                // Audit Log (Cash Payment)
                const auditLogger = (await import('../utils/auditLogger.js')).default;
                await auditLogger.log({
                    userId: req.user.id, // Treasurer ID
                    actionType: 'PAYMENT_RECEIVED_CASH',
                    entityId: paymentId,
                    details: { invoiceId, amount, receiptGenerated: true }
                }, req);
            }

            res.status(201).json({ message: 'Cash payment recorded and verified, receipt generated', paymentId });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to record cash payment' });
        }
    }

    async verifyPayment(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body; // 'verified' or 'rejected'

            if (req.user.role !== 'treasurer' && req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied' });
            }

            const updatedPayment = await paymentModel.updateStatus(id, status);

            if (status === 'verified') {
                // Update invoice status to 'paid'
                const payment = await paymentModel.findById(id);
                if (payment) {
                    // Logic Check: Partial Payments
                    // Calculate total verified amount for this invoice
                    const allPayments = await paymentModel.findByInvoiceId(payment.invoice_id);
                    const totalVerified = allPayments
                        .filter(p => p.status === 'verified')
                        .reduce((sum, p) => sum + Number(p.amount), 0);

                    // We also need the pending amount of the CURRENT payment being verified? 
                    // No, 'updateStatus' above already set it to 'verified'.
                    // So totalVerified includes the current one.

                    const invoice = await invoiceModel.findById(payment.invoice_id);

                    // Logic Check: Overpayment Handling (Tips/Credit)
                    if (totalVerified >= invoice.amount) {
                        await invoiceModel.updateStatus(payment.invoice_id, 'paid');
                        console.log(`Invoice ${payment.invoice_id} fully paid.`);

                        // Calculate Overpayment
                        const overpayment = totalVerified - invoice.amount;
                        if (overpayment > 0) {
                            const tenantModel = (await import('../models/tenantModel.js')).default;
                            // Add critical logic: Check if this overpayment was already credited?
                            // Simple logic: We just updated THIS payment to 'verified'. 
                            // So we add *this specific payment's contribution* to the overpayment?
                            // Safer: Calculate total credit balance based on all payments vs all invoices? No too heavy.
                            // Approach: If `invoice` was ALREADY paid, then `payment.amount` is full credit.
                            // If `invoice` just BECAME paid, then `totalVerified - invoice.amount` is the NEW credit generated by this batch.
                            // WAITING: If multiple payments verified at once?
                            // Simplest Atomic: Credit = (TotalVerified - InvoiceAmount).
                            // BUT we must subtract what was already credited?
                            // Ah, the issue is knowing how much was "used" for the invoice.
                            // Better: Credit = Math.max(0, payment.amount - (invoice.amount - (totalVerified - payment.amount)))
                            // i.e. The portion of *this* payment that exceeds the *remaining* balance.
                            const previousTotal = totalVerified - Number(payment.amount);
                            const remainingDue = Math.max(0, invoice.amount - previousTotal);
                            const amountUsed = Math.min(Number(payment.amount), remainingDue);
                            const amountExcess = Number(payment.amount) - amountUsed;

                            if (amountExcess > 0) {
                                // Add to tenant balance
                                // Need raw update query or method
                                await tenantModel.addCredit(invoice.tenant_id, amountExcess);
                                console.log(`Added Credit ${amountExcess} to Tenant ${invoice.tenant_id}`);

                                // Notify
                                await notificationModel.create({
                                    userId: invoice.tenant_id,
                                    message: `Overpayment of ${amountExcess} has been credited to your account balance.`,
                                    type: 'payment'
                                });
                            }
                        }
                    } else {
                        // Partial Payment Support
                        if (totalVerified > 0) {
                            await invoiceModel.updateStatus(payment.invoice_id, 'partially_paid');
                        }
                        console.log(`Invoice ${payment.invoice_id} partially paid. Total: ${totalVerified}/${invoice.amount}`);
                    }

                    // Generate Receipt (Always generate receipt for the *payment*)
                    if (invoice) {
                        await receiptModel.create({
                            paymentId: id,
                            invoiceId: payment.invoice_id,
                            tenantId: invoice.tenant_id,
                            amount: payment.amount,
                            generatedDate: new Date().toISOString(),
                            receiptNumber: `REC-${Date.now()}`
                        });

                        // Logic Check: Update Lease Deposit Status if this was a Deposit Invoice
                        if (invoice.description === 'Security Deposit') {
                            const leaseModel = await import('../models/leaseModel.js');
                            await leaseModel.default.update(invoice.lease_id, {
                                deposit_status: 'paid',
                                security_deposit: invoice.amount
                            });
                            console.log(`Updated Lease ${invoice.lease_id} deposit status to PAID.`);
                        }

                        // Notify Tenant
                        await notificationModel.create({
                            userId: invoice.tenant_id,
                            message: `Payment of ${payment.amount} for Invoice #${payment.invoice_id} has been verified.`,
                            type: 'payment'
                        });

                        // Audit Log
                        const auditLogger = (await import('../utils/auditLogger.js')).default;
                        await auditLogger.log({
                            userId: req.user.id,
                            actionType: 'PAYMENT_VERIFIED',
                            entityId: id,
                            details: { invoiceId: payment.invoice_id, amount: payment.amount }
                        }, req);
                    }
                }
            } else if (status === 'rejected') {
                const payment = await paymentModel.findById(id);
                if (payment) {
                    // Logic Fix: Revert Invoice Status if Payment is Rejected
                    // 1. Check if invoice allows reverting (i.e., was it 'paid'?)
                    // Even if not fully paid, removing a 'verified' payment reduces the balance. I should re-evaluate status.

                    const invoice = await invoiceModel.findById(payment.invoice_id);
                    if (invoice) {
                        const allPayments = await paymentModel.findByInvoiceId(payment.invoice_id);
                        // Filter out THIS payment (which is now rejected) and other non-verified
                        // Note: findById might return the OLD status if transaction not committed? 
                        // But here we just updated it above? 
                        // Wait, 'updateStatus' was called line 93. So 'payment' has new status 'rejected'.
                        // So 'allPayments' (fetched from DB) will have this payment as 'rejected'.
                        // So a simple sum of 'verified' is sufficient.

                        const totalVerified = allPayments
                            .filter(p => p.status === 'verified')
                            .reduce((sum, p) => sum + Number(p.amount), 0);

                        if (totalVerified < invoice.amount) {
                            // Revert logic: If we still have SOME verified payments, it's 'partially_paid'.
                            // Otherwise, it's 'pending' or 'overdue'.
                            let newStatus;
                            if (totalVerified > 0) {
                                newStatus = 'partially_paid';
                            } else {
                                const isOverdue = new Date() > new Date(invoice.due_date);
                                newStatus = isOverdue ? 'overdue' : 'pending';
                            }
                            await invoiceModel.updateStatus(invoice.invoice_id, newStatus);
                            console.log(`Reverted Invoice ${invoice.invoice_id} to ${newStatus}`);
                        }

                        // Logic Fix: Revert Deposit Status if applicable
                        if (invoice.description === 'Security Deposit') {
                            const leaseModel = await import('../models/leaseModel.js');
                            await leaseModel.default.update(invoice.lease_id, {
                                deposit_status: 'pending',
                                // We don't clear security_deposit amount (it's the asked amount)
                                // But if we tracked 'paid_amount', we would reduce it.
                                // Model only has 'security_deposit' (target) and 'deposit_status'.
                                // So 'pending' is correct.
                            });
                            console.log(`Reverted Lease ${invoice.lease_id} deposit status to PENDING.`);
                        }
                    }

                    // Notify Tenant
                    await notificationModel.create({
                        userId: payment.tenant_id, // payment model join doesn't usually return tenant_id unless findById joins?
                        // paymentModel.findById returns raw row?
                        // Checked model: `SELECT * FROM payments WHERE payment_id = ?`
                        // tenant_id is NOT in payments table. It's in leases->invoices.
                        // But I fetched 'invoice' above. Invoice has tenant_id (if properly joined or stored).
                        // invoiceModel.findById Join?
                        // `SELECT ri.*, l.monthly_rent, l.tenant_id FROM rent_invoices...`
                        // Yes, invoice object has tenant_id.
                        userId: invoice ? invoice.tenant_id : null, // Use invoice.tenant_id
                        message: `Payment of ${payment.amount} for Invoice #${payment.invoice_id} was rejected. Please contact support.`,
                        type: 'payment',
                        severity: 'urgent'
                    });
                }
            }

            res.json({ message: `Payment ${status}`, payment: updatedPayment });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to verify payment' });
        }
    }

    async getPayments(req, res) {
        try {
            if (req.user.role === 'tenant') {
                const payments = await paymentModel.findByTenantId(req.user.id);
                return res.json(payments);
            } else if (req.user.role === 'treasurer') {
                const payments = await paymentModel.findByTreasurerId(req.user.id);
                return res.json(payments);
            } else if (req.user.role === 'owner') {
                const payments = await paymentModel.findAll();
                return res.json(payments);
            } else {
                return res.status(403).json({ error: 'Access denied' });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch payments' });
        }
    }
}

export default new PaymentController();
