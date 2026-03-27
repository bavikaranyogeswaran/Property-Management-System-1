import pool from '../config/db.js';
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
import emailService from '../utils/emailService.js';
import { getCurrentDateString, getLocalTime, today, now, parseLocalDate, addDays, formatToLocalDate } from '../utils/dateUtils.js';

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
            return { accountType: 'revenue', category: 'maintenance' };
        default:
            return { accountType: 'revenue', category: 'other' };
    }
}

class PaymentService {

    async submitPayment(data, tenantId, file) {
        const { invoiceId, amount, paymentDate, paymentMethod, referenceNumber } = data;
        let evidenceUrl = data.evidenceUrl;

        if (file) {
            if (!file.path && !file.secure_url) {
                throw new Error('Payment evidence file is corrupted or missing path.');
            }
            evidenceUrl = file.path || file.secure_url;
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Integrity Check: Is invoice already paid?
            const [invoices] = await connection.query("SELECT * FROM rent_invoices WHERE invoice_id = ?", [invoiceId]);
            const invoice = invoices[0];
            
            if (!invoice) throw new Error('Invoice not found');
            if (String(invoice.lease_id) && invoice.status === 'paid') {
                throw new Error('This invoice has already been paid.');
            }

            // Authorization
            const [leases] = await connection.query("SELECT tenant_id FROM leases WHERE lease_id = ?", [invoice.lease_id]);
            if (!leases[0] || String(leases[0].tenant_id) !== String(tenantId)) {
                throw new Error('Access denied. This invoice does not belong to you.');
            }

            // Concurrency Control: One pending payment at a time
            const [pendingPayments] = await connection.query(
                "SELECT payment_id FROM payments WHERE invoice_id = ? AND status = 'pending'",
                [invoiceId]
            );
            if (pendingPayments.length > 0) {
                throw new Error('You already have a pending payment for this invoice. Please wait for verification.');
            }

            const paymentId = await paymentModel.create({
                invoiceId,
                amount,
                paymentDate,
                paymentMethod,
                referenceNumber,
                evidenceUrl,
            }, connection);

            // Notify Treasurers
            const [treasurers] = await connection.query("SELECT user_id FROM users WHERE role = 'treasurer' AND status = 'active'");
            for (const t of treasurers) {
                await notificationModel.create({
                    userId: t.user_id,
                    message: `New Payment submitted for Invoice #${invoiceId} (Amount: ${amount}).`,
                    type: 'payment',
                }, connection);
            }

            await connection.commit();
            return paymentId;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async _postToLedger(paymentId, invoice, amount, description, connection) {
        const { accountType, category } = getLedgerClassification(invoice.invoice_type);
        return await ledgerModel.create({
            paymentId: Number(paymentId),
            invoiceId: invoice.invoice_id,
            leaseId: invoice.lease_id,
            accountType,
            category,
            credit: Number(amount),
            description: description || `Payment for ${invoice.invoice_type}`,
            entryDate: getCurrentDateString(),
        }, connection);
    }

    async recordCashPayment(data, treasurerUser) {
        if (treasurerUser.role !== 'treasurer') {
            throw new Error('Access denied. Only Treasurers can record cash payments.');
        }

        const { invoiceId, amount, paymentDate, referenceNumber } = data;

        // Integrity Check
        const invoiceCheck = await invoiceModel.findById(invoiceId);
        if (!invoiceCheck) {
            throw new Error('Invoice not found');
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const paymentId = await paymentModel.create({
                invoiceId,
                amount,
                paymentDate,
                paymentMethod: 'cash',
                referenceNumber: referenceNumber || `CASH-${Date.now()}`,
                evidenceUrl: null,
            }, connection);

            const { payment: updatedPayment } = await paymentModel.updateStatus(paymentId, 'verified', null, connection);

            // Calculate total verified payments for this invoice
            const allPayments = await paymentModel.findByInvoiceId(invoiceId, connection);
            const totalVerified = allPayments
                .filter((p) => p.status === 'verified')
                .reduce((sum, p) => sum + Number(p.amount), 0);

            const invoice = await invoiceModel.findById(invoiceId, connection);

            if (invoice) {
                const previousVerified = totalVerified - Number(amount);
                const amountAppliedToInvoice = Math.min(Number(amount), Math.max(0, invoice.amount - previousVerified));
                const incrementalOverpayment = Number(amount) - amountAppliedToInvoice;

                if (totalVerified >= invoice.amount) {
                    await invoiceModel.updateStatus(invoiceId, 'paid', connection);

                    // Overpayment Logic: Credit excess to tenant account (Bug B5 Fix)
                    if (incrementalOverpayment > 0) {
                        await tenantModel.addCredit(invoice.tenant_id, incrementalOverpayment, connection);
                        await notificationModel.create({
                            userId: invoice.tenant_id,
                            message: `Overpayment of ${incrementalOverpayment} has been credited to your account balance.`,
                            type: 'payment',
                        }, connection);
                    }
                } else if (totalVerified > 0) {
                    await invoiceModel.updateStatus(invoiceId, 'partially_paid', connection);
                }

                await receiptModel.create({
                    paymentId,
                    invoiceId,
                    tenantId: invoice.tenant_id,
                    amount,
                    generatedDate: today(),
                    receiptNumber: `REC-CASH-${randomUUID()}`,
                }, connection);

                await auditLogger.log(
                    {
                        userId: treasurerUser.id,
                        actionType: 'PAYMENT_RECEIVED_CASH',
                        entityId: paymentId,
                        details: { invoiceId, amount, receiptGenerated: true },
                    },
                    null,
                    connection
                );

                // Post Ledger Entry (Centralized)
                await this._postToLedger(
                    paymentId, 
                    invoice, 
                    amount, 
                    `Cash payment for ${invoice.description || invoice.invoice_type}`, 
                    connection
                );

                await connection.commit();

                // Fire-and-forget emails outside transaction
                try {
                    const tenant = await userModel.findById(invoice.tenant_id);
                    if (tenant && tenant.email) {
                        await emailService.sendPaymentConfirmation(tenant.email, {
                            amount: amount,
                            paymentMethod: 'cash',
                            referenceNumber: referenceNumber || `CASH-${Date.now()}`,
                            invoiceId: invoiceId
                        });
                    }
                } catch (emailErr) {
                    console.error('Failed to send cash payment confirmation email:', emailErr);
                }

                return paymentId;

            } else {
                throw new Error('Invoice vanished during transaction');
            }

        } catch (error) {
            await connection.rollback();
            console.error('Record Cash Payment Transaction Failed:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    async verifyPayment(paymentId, status, user, reason = null) {
        if (user.role !== 'treasurer') {
            throw new Error('Access denied. Only Treasurers can verify payments.');
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const { payment: updatedPayment, changed } = await paymentModel.updateStatus(paymentId, status, null, connection);

            // Concurrency Lock: If this payment was ALREADY set to this status by another request, halt.
            if (!changed) {
                 console.warn(`Idempotency caught duplicate status update for Payment ${paymentId}`);
                 await connection.rollback();
                 return updatedPayment;
            }

            if (status === 'verified') {
                const payment = updatedPayment;
                if (payment) {
                    // Logic Check: Partial Payments
                    const allPayments = await paymentModel.findByInvoiceId(payment.invoiceId, connection);
                    const totalVerified = allPayments
                        .filter((p) => p.status === 'verified')
                        .reduce((sum, p) => sum + Number(p.amount), 0);

                    const invoice = await invoiceModel.findById(payment.invoiceId, connection);

                    if (!invoice) {
                        throw new Error('Invoice not found for verification');
                    }

                    // Lease Status Warning
                    const lease = await leaseModel.findById(invoice.lease_id, connection);
                    if (lease && lease.status === 'ended') {
                        console.warn(`Verified payment ${paymentId} for invoice linked to ENDED lease ${lease.lease_id}`);
                    }

                    const previousVerified = totalVerified - Number(payment.amount);
                    const amountAppliedToInvoice = Math.min(Number(payment.amount), Math.max(0, invoice.amount - previousVerified));
                    const incrementalOverpayment = Number(payment.amount) - amountAppliedToInvoice;

                    if (totalVerified >= invoice.amount) {
                        await invoiceModel.updateStatus(payment.invoiceId, 'paid', connection);
                        
                        // Overpayment Logic (Bug B5 Fix)
                        if (incrementalOverpayment > 0) {
                            await tenantModel.addCredit(invoice.tenant_id, incrementalOverpayment, connection);
                            await notificationModel.create({
                                userId: invoice.tenant_id,
                                message: `Overpayment of ${incrementalOverpayment} has been credited to your account balance.`,
                                type: 'payment',
                            }, connection);
                        }

                    } else if (totalVerified > 0) {
                         await invoiceModel.updateStatus(payment.invoiceId, 'partially_paid', connection);
                    }

                    // Generate Receipt
                     const existingReceipt = await receiptModel.findByPaymentId(paymentId, connection);
                     if (!existingReceipt) {
                        await receiptModel.create({
                            paymentId: paymentId,
                            invoiceId: payment.invoiceId,
                            tenantId: invoice.tenant_id,
                            amount: payment.amount,
                            generatedDate: today(),
                            receiptNumber: `REC-${randomUUID()}`,
                        }, connection);

                        // Deposit Status Logic
                        if (invoice.invoice_type === 'deposit') {
                             const newHeld = Number(lease.security_deposit || 0) + amountAppliedToInvoice;
                             
                             const finalInvoice = await invoiceModel.findById(payment.invoiceId, connection);
                             const finalStatus = finalInvoice.status === 'paid' ? 'paid' : 'pending';
                             
                             await leaseModel.update(invoice.lease_id, {
                                 deposit_status: finalStatus,
                                 security_deposit: newHeld,
                             }, connection);
                        }

                        // Notify Tenant
                        await notificationModel.create({
                            userId: invoice.tenant_id,
                            message: `Payment of ${payment.amount} for Invoice #${payment.invoiceId} has been verified.`,
                            type: 'payment',
                        }, connection);

                        await auditLogger.log({
                            userId: user.id,
                            actionType: 'PAYMENT_VERIFIED',
                            entityId: paymentId,
                            details: { invoiceId: payment.invoiceId, amount: payment.amount },
                        }, null, connection);

                        // Post Ledger Entry (Centralized)
                        await this._postToLedger(
                            paymentId,
                            invoice,
                            payment.amount,
                            `Payment verified for ${invoice.description || invoice.invoice_type}`,
                            connection
                        );

                        // Behavior Score
                        try {
                            const paymentDate = parseLocalDate(payment.paymentDate);
                            const dueDate = parseLocalDate(invoice.due_date);
                            const payStr = formatToLocalDate(paymentDate);
                            const dueStr = formatToLocalDate(dueDate);

                            if (payStr <= dueStr) {
                                 await behaviorLogModel.logPositivePayment(invoice.tenant_id, 5, connection);
                                 await tenantModel.incrementBehaviorScore(invoice.tenant_id, 5, connection);
                            }
                        } catch (scoreErr) {
                             console.error('Failed to update positive score:', scoreErr);
                        }
                     }
                }
            } else if (status === 'rejected') {
                 const payment = updatedPayment;
                 if (payment) {
                     const invoice = await invoiceModel.findById(payment.invoiceId, connection);
                     if (invoice) {
                         const allPayments = await paymentModel.findByInvoiceId(payment.invoiceId, connection);
                         const totalVerified = allPayments
                            .filter((p) => p.status === 'verified')
                            .reduce((sum, p) => sum + Number(p.amount), 0);
                         
                         if (totalVerified < invoice.amount) {
                             let newStatus;
                             if (totalVerified > 0) {
                                 newStatus = 'partially_paid';
                             } else {
                                 const isOverdue = now() > parseLocalDate(invoice.due_date);
                                 newStatus = isOverdue ? 'overdue' : 'pending';
                             }
                             await invoiceModel.updateStatus(invoice.invoice_id, newStatus, connection);
                         }

                         if (invoice.invoice_type === 'deposit') {
                              await leaseModel.update(invoice.lease_id, {
                                  deposit_status: 'pending',
                              }, connection);
                         }
                         
                         const rejectMessage = reason 
                            ? `Payment of ${payment.amount} for Invoice #${payment.invoiceId} was rejected. Reason: ${reason}`
                            : `Payment of ${payment.amount} for Invoice #${payment.invoiceId} was rejected. Please contact support.`;

                          await notificationModel.create({
                             userId: invoice.tenant_id,
                             message: rejectMessage,
                             type: 'payment',
                             severity: 'urgent',
                          }, connection);

                          await auditLogger.log({
                             userId: user.id,
                             actionType: 'PAYMENT_REJECTED',
                             entityId: paymentId,
                             details: { invoiceId: payment.invoiceId, amount: payment.amount, reason },
                         }, { user: user }, connection);
                     }
                 }
            }

            await connection.commit();

            // Fire-and-forget emails outside transaction
            if (status === 'verified') {
                const invoice = await invoiceModel.findById(updatedPayment.invoiceId);
                try {
                    const tenant = await userModel.findById(invoice.tenant_id);
                    if (tenant && tenant.email) {
                        await emailService.sendPaymentConfirmation(tenant.email, {
                            amount: updatedPayment.amount,
                            paymentMethod: updatedPayment.paymentMethod,
                            referenceNumber: updatedPayment.referenceNumber,
                            invoiceId: updatedPayment.invoiceId
                        });
                    }
                } catch (emailErr) {
                    console.error('Failed to send payment verification email:', emailErr);
                }
            } else if (status === 'rejected') {
                const invoice = await invoiceModel.findById(updatedPayment.invoiceId);
                try {
                    const tenant = await userModel.findById(invoice.tenant_id);
                    if (tenant && tenant.email) {
                        await emailService.sendPaymentRejection(tenant.email, {
                            amount: updatedPayment.amount,
                            invoiceId: updatedPayment.invoiceId,
                            reason: reason
                        });
                    }
                } catch (emailErr) {
                    console.error('Failed to send payment rejection email:', emailErr);
                }
            }

            return updatedPayment;

        } catch (error) {
            await connection.rollback();
            console.error('Verify Payment Transaction Failed:', error);
            throw error;
        } finally {
            connection.release();
        }
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
