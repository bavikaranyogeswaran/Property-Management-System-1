import paymentModel from '../models/paymentModel.js';
import invoiceModel from '../models/invoiceModel.js';
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

                    if (invoice && totalVerified >= invoice.amount) {
                        await invoiceModel.updateStatus(payment.invoice_id, 'paid');
                        console.log(`Invoice ${payment.invoice_id} fully paid.`);
                    } else {
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
                            const leaseModel = await import('../models/leaseModel.js'); // Dynamic import to avoid cycles? Or simple import at top
                            // leaseModel import is not at top. Let's assume we can add it or use dynamic.
                            // Better: Add import at top, but for now dynamic is safer for hotfix.
                            await leaseModel.default.update(invoice.lease_id, {
                                deposit_status: 'paid',
                                security_deposit: payment.amount // Ensure amount matches if varying? Or just trust lease setup.
                            });
                            console.log(`Updated Lease ${invoice.lease_id} deposit status to PAID.`);
                        }

                        // Notify Tenant
                        await notificationModel.create({
                            userId: invoice.tenant_id,
                            message: `Payment of ${payment.amount} for Invoice #${payment.invoice_id} has been verified.`,
                            type: 'payment'
                        });
                    }
                }
            } else if (status === 'rejected') {
                const payment = await paymentModel.findById(id);
                if (payment) {
                    // Notify Tenant
                    await notificationModel.create({
                        userId: payment.tenant_id,
                        message: `Payment of ${payment.amount} for Invoice #${payment.invoice_id} was rejected. Please contact support.`,
                        type: 'payment',
                        severity: 'urgent' // Optional field if model supports it, otherwise ignored
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
