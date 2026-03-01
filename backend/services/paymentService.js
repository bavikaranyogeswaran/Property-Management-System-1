
import { randomUUID } from 'crypto';
import paymentModel from '../models/paymentModel.js';
import invoiceModel from '../models/invoiceModel.js';
import notificationModel from '../models/notificationModel.js';
import userModel from '../models/userModel.js';
import receiptModel from '../models/receiptModel.js';
import behaviorLogModel from '../models/behaviorLogModel.js';
import tenantModel from '../models/tenantModel.js';
import leaseModel from '../models/leaseModel.js';
import auditLogger from '../utils/auditLogger.js';
import ledgerModel from '../models/ledgerModel.js';

/**
 * Maps an invoice_type to the correct accounting ledger classification.
 */
function getLedgerClassification(invoiceType) {
    switch (invoiceType) {
        case 'deposit':
            return { accountType: 'liability', category: 'deposit_held' };
        case 'rent':
            return { accountType: 'revenue', category: 'rent' };
        case 'late_fee':
            return { accountType: 'revenue', category: 'late_fee' };
        case 'maintenance':
            return { accountType: 'expense', category: 'maintenance' };
        default:
            return { accountType: 'revenue', category: 'other' };
    }
}

class PaymentService {

    async submitPayment(data, tenantId, file) {
        const { invoiceId, amount, paymentDate, paymentMethod, referenceNumber } = data;
        let evidenceUrl = data.evidenceUrl;

        if (file) {
            evidenceUrl = `/uploads/${file.filename}`;
        }

        // Integrity Check: Is invoice already paid?
        const invoice = await invoiceModel.findById(invoiceId);
        if (!invoice) {
            throw new Error('Invoice not found');
        }

        // Authorization: Verify this invoice belongs to the requesting tenant
        if (String(invoice.tenant_id) !== String(tenantId)) {
            throw new Error('Access denied. This invoice does not belong to you.');
        }

        if (invoice.status === 'paid') {
            throw new Error('This invoice has already been paid.');
        }

        const paymentId = await paymentModel.create({
            invoiceId,
            amount,
            paymentDate,
            paymentMethod,
            referenceNumber,
            evidenceUrl,
        });

        // Notify Treasurers
        try {
            const treasurers = await userModel.findByRole('treasurer');
            for (const t of treasurers) {
                await notificationModel.create({
                    userId: t.user_id,
                    message: `New Payment submitted for Invoice #${invoiceId} (Amount: ${amount}).`,
                    type: 'payment',
                });
            }
        } catch (noteErr) {
            console.error('Failed to notify treasurers', noteErr);
        }

        return paymentId;
    }

    async recordCashPayment(data, treasurerUser) {
        if (treasurerUser.role !== 'treasurer') {
            throw new Error('Access denied. Only Treasurers can record cash payments.');
        }

        const { invoiceId, amount, paymentDate, referenceNumber } = data;

        // Integrity Check: Is invoice already paid?
        const invoiceCheck = await invoiceModel.findById(invoiceId);
        if (!invoiceCheck) {
            throw new Error('Invoice not found');
        }
        if (invoiceCheck.status === 'paid') {
            throw new Error('This invoice has already been paid.');
        }

        const paymentId = await paymentModel.create({
            invoiceId,
            amount,
            paymentDate,
            paymentMethod: 'cash',
            referenceNumber: referenceNumber || `CASH-${Date.now()}`,
            evidenceUrl: null,
        });

        const { payment: updatedPayment } = await paymentModel.updateStatus(paymentId, 'verified');

        // Calculate total verified payments for this invoice (same logic as verifyPayment)
        const allPayments = await paymentModel.findByInvoiceId(invoiceId);
        const totalVerified = allPayments
            .filter((p) => p.status === 'verified')
            .reduce((sum, p) => sum + Number(p.amount), 0);

        const invoice = await invoiceModel.findById(invoiceId);

        if (invoice) {
            if (totalVerified >= invoice.amount) {
                await invoiceModel.updateStatus(invoiceId, 'paid');

                // Overpayment Logic: Credit excess to tenant account
                const overpayment = totalVerified - invoice.amount;
                if (overpayment > 0) {
                    await tenantModel.addCredit(invoice.tenant_id, overpayment);
                    await notificationModel.create({
                        userId: invoice.tenant_id,
                        message: `Overpayment of ${overpayment} has been credited to your account balance.`,
                        type: 'payment',
                    });
                }
            } else if (totalVerified > 0) {
                await invoiceModel.updateStatus(invoiceId, 'partially_paid');
            }

            await receiptModel.create({
                paymentId,
                invoiceId,
                tenantId: invoice.tenant_id,
                amount,
                generatedDate: new Date().toISOString(),
                receiptNumber: `REC-CASH-${randomUUID()}`,
            });

            await auditLogger.log(
                {
                    userId: treasurerUser.id,
                    actionType: 'PAYMENT_RECEIVED_CASH',
                    entityId: paymentId,
                    details: { invoiceId, amount, receiptGenerated: true },
                },
                { user: treasurerUser }
            );

            // Post Ledger Entry
            try {
                const { accountType, category } = getLedgerClassification(invoice.invoice_type);
                await ledgerModel.create({
                    paymentId,
                    invoiceId: invoice.invoice_id,
                    leaseId: invoice.lease_id,
                    accountType,
                    category,
                    credit: Number(amount),
                    description: `Cash payment for ${invoice.description || invoice.invoice_type}`,
                    entryDate: new Date().toISOString().split('T')[0],
                });
            } catch (ledgerErr) {
                console.error('Failed to post ledger entry (cash):', ledgerErr);
            }
        }

        return paymentId;
    }

    async verifyPayment(paymentId, status, user) {
        if (user.role !== 'treasurer' && user.role !== 'owner') {
            throw new Error('Access denied');
        }

        const { payment: updatedPayment, changed } = await paymentModel.updateStatus(paymentId, status);

        // Concurrency Lock: If this payment was ALREADY set to this status by another request, halt.
        if (!changed) {
             console.warn(`Idempotency caught duplicate status update for Payment ${paymentId}`);
             return updatedPayment;
        }

        if (status === 'verified') {
            const payment = updatedPayment;
            if (payment) {
                // Logic Check: Partial Payments
                const allPayments = await paymentModel.findByInvoiceId(payment.invoiceId);
                const totalVerified = allPayments
                    .filter((p) => p.status === 'verified')
                    .reduce((sum, p) => sum + Number(p.amount), 0);

                const invoice = await invoiceModel.findById(payment.invoiceId);

                if (!invoice) {
                    throw new Error('Invoice not found for verification'); // Or log error
                }

                if (totalVerified >= invoice.amount) {
                    await invoiceModel.updateStatus(payment.invoiceId, 'paid');
                    
                    // Overpayment Logic
                    const overpayment = totalVerified - invoice.amount;
                    if (overpayment > 0) {
                         const previousTotal = totalVerified - Number(payment.amount);
                         const remainingDue = Math.max(0, invoice.amount - previousTotal);
                         const amountUsed = Math.min(Number(payment.amount), remainingDue);
                         const amountExcess = Number(payment.amount) - amountUsed;

                         if (amountExcess > 0) {
                            await tenantModel.addCredit(invoice.tenant_id, amountExcess);
                            await notificationModel.create({
                                userId: invoice.tenant_id,
                                message: `Overpayment of ${amountExcess} has been credited to your account balance.`,
                                type: 'payment',
                            });
                         }
                    }

                } else {
                    if (totalVerified > 0) {
                         await invoiceModel.updateStatus(payment.invoiceId, 'partially_paid');
                    }
                }

                // Generate Receipt
                 const existingReceipt = await receiptModel.findByPaymentId(paymentId);
                 if (!existingReceipt) {
                    await receiptModel.create({
                        paymentId: paymentId,
                        invoiceId: payment.invoiceId,
                        tenantId: invoice.tenant_id,
                        amount: payment.amount,
                        generatedDate: new Date().toISOString(),
                        receiptNumber: `REC-${randomUUID()}`,
                    });

                    // Deposit Status Logic
                    if (invoice.invoice_type === 'deposit') {
                         const previousTotal = totalVerified - Number(payment.amount);
                         const remainingDue = Math.max(0, Number(invoice.amount) - previousTotal);
                         const amountUsed = Math.min(Number(payment.amount), remainingDue);
                         
                         const lease = await leaseModel.findById(invoice.lease_id);
                         const currentHeld = Number(lease.securityDeposit || 0);
                         const newHeld = currentHeld + amountUsed;
                         
                         const finalStatus = (await invoiceModel.findById(payment.invoiceId)).status === 'paid' ? 'paid' : 'pending';
                         
                         await leaseModel.update(invoice.lease_id, {
                             deposit_status: finalStatus,
                             security_deposit: newHeld,
                         });
                    }

                    // Notify Tenant
                    await notificationModel.create({
                        userId: invoice.tenant_id,
                        message: `Payment of ${payment.amount} for Invoice #${payment.invoiceId} has been verified.`,
                        type: 'payment',
                    });

                    await auditLogger.log({
                        userId: user.id,
                        actionType: 'PAYMENT_VERIFIED',
                        entityId: paymentId,
                        details: { invoiceId: payment.invoiceId, amount: payment.amount },
                    }, { user: user });

                    // Post Ledger Entry
                    try {
                        const { accountType, category } = getLedgerClassification(invoice.invoice_type);
                        await ledgerModel.create({
                            paymentId: Number(paymentId),
                            invoiceId: invoice.invoice_id,
                            leaseId: invoice.lease_id,
                            accountType,
                            category,
                            credit: Number(payment.amount),
                            description: `Payment verified for ${invoice.description || invoice.invoice_type}`,
                            entryDate: new Date().toISOString().split('T')[0],
                        });
                    } catch (ledgerErr) {
                        console.error('Failed to post ledger entry (verify):', ledgerErr);
                    }

                    // Behavior Score
                    try {
                        const paymentDate = new Date(payment.paymentDate);
                        const dueDate = new Date(invoice.due_date);
                        const payStr = paymentDate.toISOString().split('T')[0];
                        const dueStr = dueDate.toISOString().split('T')[0];

                        if (payStr <= dueStr) {
                             await behaviorLogModel.logPositivePayment(invoice.tenant_id, 5);
                             await tenantModel.incrementBehaviorScore(invoice.tenant_id, 5);
                        }
                    } catch (scoreErr) {
                         console.error('Failed to update positive score:', scoreErr);
                    }
                 }
            }
        } else if (status === 'rejected') {
             const payment = updatedPayment;
             if (payment) {
                 const invoice = await invoiceModel.findById(payment.invoiceId);
                 if (invoice) {
                     const allPayments = await paymentModel.findByInvoiceId(payment.invoiceId);
                     const totalVerified = allPayments
                        .filter((p) => p.status === 'verified')
                        .reduce((sum, p) => sum + Number(p.amount), 0);
                     
                     if (totalVerified < invoice.amount) {
                         let newStatus;
                         if (totalVerified > 0) {
                             newStatus = 'partially_paid';
                         } else {
                             const isOverdue = new Date() > new Date(invoice.due_date);
                             newStatus = isOverdue ? 'overdue' : 'pending';
                         }
                         await invoiceModel.updateStatus(invoice.invoice_id, newStatus);
                     }

                     if (invoice.invoice_type === 'deposit') {
                          await leaseModel.update(invoice.lease_id, {
                              deposit_status: 'pending',
                          });
                     }
                     
                     await notificationModel.create({
                         userId: invoice.tenant_id,
                         message: `Payment of ${payment.amount} for Invoice #${payment.invoiceId} was rejected. Please contact support.`,
                         type: 'payment',
                         severity: 'urgent',
                     });
                 }
             }
        }
        return updatedPayment;
    }
    
    async getPayments(user) {
         if (user.role === 'tenant') {
             return await paymentModel.findByTenantId(user.id);
         } else if (user.role === 'treasurer') {
             return await paymentModel.findByTreasurerId(user.id);
         } else if (user.role === 'owner') {
             return await paymentModel.findByOwnerId(user.id);
         } else {
             throw new Error('Access denied');
         }
    }
}

export default new PaymentService();
