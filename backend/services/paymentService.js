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

    async submitGuestPayment(data, magicToken, file) {
        const { paymentDate, paymentMethod, referenceNumber } = data;
        let evidenceUrl = data.evidenceUrl;

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Verify Magic Token
            const invoice = await invoiceModel.findByMagicToken(magicToken, connection);
            if (!invoice) throw new Error('Invalid or expired payment link.');
            
            if (invoice.status === 'paid') {
                throw new Error('This invoice has already been paid.');
            }

            // [HARDENED] Unit Availability & Lease Integrity Validation
            // We use FOR UPDATE to lock the lease row and ensure no status changes (like cancellation) happen mid-payment.
            const [leaseStatus] = await connection.query(
                "SELECT status, unit_id, start_date, end_date FROM leases WHERE lease_id = ? FOR UPDATE",
                [invoice.lease_id]
            );
            
            if (!leaseStatus[0] || leaseStatus[0].status === 'cancelled') {
                throw new Error('This lease offer has expired or been cancelled. Please contact the property manager.');
            }

            // Atomic Overlap Check: Ensure no one ELSE has already submitted a payment for this unit during these dates.
            // This is the "Hard Reservation Lock" mentioned in the audit.
            const [overlappingPayments] = await connection.query(
                `SELECT p.payment_id 
                 FROM payments p
                 JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
                 JOIN leases l ON ri.lease_id = l.lease_id
                 WHERE l.unit_id = ? 
                 AND l.lease_id != ?
                 AND p.status IN ('pending', 'verified')
                 AND l.status IN ('active', 'draft')
                 AND l.start_date <= ? 
                 AND (l.end_date IS NULL OR l.end_date >= ?)`,
                [leaseStatus[0].unit_id, invoice.lease_id, leaseStatus[0].end_date, leaseStatus[0].start_date]
            );

            if (overlappingPayments.length > 0) {
                 throw new Error(`Concurrency Alert: Unit ${invoice.unitNumber} already has a pending or confirmed payment from another applicant for these overlapping dates. Proceeding with this payment would cause a double-lease risk.`);
            }

            const invoiceId = invoice.id;
            const amount = invoice.amount; // Guests must pay the full amount for the deposit to "hold" the unit

            if (file) {
                if (!file.path && !file.secure_url) {
                    throw new Error('Payment evidence file is corrupted or missing path.');
                }
                evidenceUrl = file.path || file.secure_url;
            }

            // 2. Concurrency Control: One pending payment at a time (for this specific invoice)
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

            // 3. Notify Treasurers
            const [treasurers] = await connection.query("SELECT user_id FROM users WHERE role = 'treasurer' AND status = 'active'");
            for (const t of treasurers) {
                await notificationModel.create({
                    userId: t.user_id,
                    message: `GUEST PAYMENT: New Deposit submitted via Magic Link for Unit ${invoice.unitNumber} (Amount: ${amount}).`,
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
        const { accountType, category } = getLedgerClassification(invoice.invoiceType || invoice.invoice_type);
        return await ledgerModel.create({
            paymentId: Number(paymentId),
            invoiceId: invoice.id || invoice.invoice_id,
            leaseId: invoice.leaseId || invoice.lease_id,
            accountType,
            category,
            credit: Number(amount),
            description: description || `Payment for ${invoice.description || invoice.invoice_type}`,
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
                        await tenantModel.addCredit(invoice.tenantId || invoice.tenant_id, incrementalOverpayment, connection);
                        await notificationModel.create({
                            userId: invoice.tenantId || invoice.tenant_id,
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
                    const tenant = await userModel.findById(invoice.tenantId || invoice.tenant_id);
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
                    const lease = await leaseModel.findById(invoice.leaseId, connection);
                    if (lease && lease.status === 'ended') {
                        console.warn(`Verified payment ${paymentId} for invoice linked to ENDED lease ${lease.id}`);
                    }

                    const previousVerified = totalVerified - Number(payment.amount);
                    const amountAppliedToInvoice = Math.min(Number(payment.amount), Math.max(0, invoice.amount - previousVerified));
                    const incrementalOverpayment = Number(payment.amount) - amountAppliedToInvoice;

                    if (totalVerified >= invoice.amount) {
                        await invoiceModel.updateStatus(payment.invoiceId, 'paid', connection);
                        
                        // Overpayment Logic (Bug B5 Fix)
                        if (incrementalOverpayment > 0) {
                            await tenantModel.addCredit(invoice.tenantId, incrementalOverpayment, connection);
                            await notificationModel.create({
                                userId: invoice.tenantId,
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
                            tenantId: invoice.tenantId,
                            amount: payment.amount,
                            generatedDate: today(),
                            receiptNumber: `REC-${randomUUID()}`,
                        }, connection);

                        // [CRITICAL FIX] Post Ledger Entry BEFORE activation
                        // This ensures that lease status checks (deposit balance) can see the verified funds.
                        await this._postToLedger(
                            paymentId,
                            invoice,
                            payment.amount,
                            `Payment verified for ${invoice.description || invoice.invoiceType}`,
                            connection
                        );

                        // Deposit Status Logic
                        if (invoice.invoiceType === 'deposit') {
                             const newHeld = Number(lease.securityDeposit || 0) + amountAppliedToInvoice;
                             
                             const finalInvoice = await invoiceModel.findById(payment.invoiceId, connection);
                             const finalStatus = finalInvoice.status === 'paid' ? 'paid' : 'pending';
                             
                             await leaseModel.update(invoice.leaseId, {
                                 depositStatus: finalStatus,
                                 securityDeposit: newHeld,
                             }, connection);
                        }

                        // Notify Tenant
                        await notificationModel.create({
                            userId: invoice.tenantId,
                            message: `Payment of ${payment.amount} for Invoice #${payment.invoiceId} has been verified.`,
                            type: 'payment',
                        }, connection);

                        // [AUTO-ACTIVATION] If full deposit is paid on a draft lease, activate it immediately.
                        const finalInvoice = await invoiceModel.findById(payment.invoiceId, connection);
                        if (finalInvoice.status === 'paid' && invoice.invoiceType === 'deposit') {
                            const lease = await leaseModel.findById(invoice.leaseId, connection);
                            if (lease && lease.status === 'draft') {
                                if (lease.isDocumentsVerified) {
                                    const leaseService = (await import('./leaseService.js')).default;
                                    await leaseService.signLease(lease.id, user, connection);
                                    
                                    // Trigger Onboarding (Set Password email)
                                    const userService = (await import('./userService.js')).default;
                                    await userService.triggerOnboarding(lease.tenantId, connection);
                                } else {
                                    // Notify Treasurers and Owners that payment is done but documents need review
                                    const [propertyInfo] = await connection.query("SELECT owner_id FROM properties WHERE property_id = ?", [lease.propertyId]);
                                    const ownerId = propertyInfo[0]?.owner_id;
                                    
                                    const [assignedStaff] = await connection.query(
                                        "SELECT user_id FROM staff_property_assignments WHERE property_id = ?",
                                        [lease.propertyId]
                                    );

                                    const userIdsToNotify = new Set();
                                    if (ownerId) userIdsToNotify.add(ownerId);
                                    assignedStaff.forEach(s => userIdsToNotify.add(s.user_id));

                                    for (const userId of userIdsToNotify) {
                                        await notificationModel.create({
                                            userId: userId,
                                            message: `URGENT: Deposit Paid for Lease #${lease.id} (Unit ${lease.unitNumber}). Documents are PENDING verification. Please review and activate.`,
                                            type: 'lease',
                                            severity: 'urgent'
                                        }, connection);
                                    }
                                    
                                    console.log(`[PaymentService] Deposit paid for Lease ${lease.id}, notified ${userIdsToNotify.size} staff members. Auto-activation pending document verification.`);
                                }
                            }
                        }

                        await auditLogger.log({
                            userId: user.id,
                            actionType: 'PAYMENT_VERIFIED',
                            entityId: paymentId,
                            details: { invoiceId: payment.invoiceId, amount: payment.amount },
                        }, null, connection);

                        // Behavior Score
                        try {
                            const paymentDate = parseLocalDate(payment.paymentDate);
                            const dueDate = parseLocalDate(invoice.dueDate);
                            const payStr = formatToLocalDate(paymentDate);
                            const dueStr = formatToLocalDate(dueDate);

                            if (payStr <= dueStr) {
                                 await behaviorLogModel.logPositivePayment(invoice.tenantId, 5, connection);
                                 await tenantModel.incrementBehaviorScore(invoice.tenantId, 5, connection);
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
                             userId: invoice.tenantId || invoice.tenant_id,
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
                    const tenant = await userModel.findById(invoice.tenantId || invoice.tenant_id);
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
                    const tenant = await userModel.findById(invoice.tenantId || invoice.tenant_id);
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

    /**
     * Automatically applies any existing credit balance from the tenant's record
     * to a specific invoice. Reduces the "Balance Due" by creating a 'credit_applied' payment.
     */
    async applyTenantCredit(invoiceId, connection = null) {
        const db = connection || pool;
        const isExternalConn = !!connection;
        const conn = isExternalConn ? connection : await pool.getConnection();

        try {
            if (!isExternalConn) await conn.beginTransaction();

            // 1. Fetch Invoice
            const invoice = await invoiceModel.findById(invoiceId, conn);
            if (!invoice) throw new Error(`Invoice #${invoiceId} not found`);
            if (invoice.status === 'paid') {
                if (!isExternalConn) await conn.rollback();
                return null;
            }

            // 2. Fetch Tenant Credit Balance
            const tenant = await tenantModel.findByUserId(invoice.tenantId, conn);
            if (!tenant || tenant.creditBalance <= 0) {
                if (!isExternalConn) await conn.rollback();
                return null;
            }

            // 3. Calculate Amount to Apply (Balance Due check)
            const allPayments = await paymentModel.findByInvoiceId(invoiceId, conn);
            const totalVerified = allPayments
                .filter((p) => p.status === 'verified')
                .reduce((sum, p) => sum + Number(p.amount), 0);
            
            const remainingDue = Math.max(0, invoice.amount - totalVerified);
            if (remainingDue <= 0) {
                if (!isExternalConn) await conn.rollback();
                return null;
            }

            const amountToApply = Math.min(tenant.creditBalance, remainingDue);
            if (amountToApply <= 0) {
                if (!isExternalConn) await conn.rollback();
                return null;
            }

            // 4. Create Verified 'credit_applied' Payment
            const payId = await paymentModel.create({
                invoiceId,
                amount: amountToApply,
                paymentDate: today(),
                paymentMethod: 'credit_applied',
                referenceNumber: `CREDIT-${Date.now()}`,
                evidenceUrl: null,
            }, conn);
            await paymentModel.updateStatus(payId, 'verified', null, conn);

            // 5. Update Tenant Balance
            await tenantModel.deductCredit(invoice.tenantId, amountToApply, conn);

            // 6. Update Invoice Status
            const newTotalVerified = totalVerified + amountToApply;
            if (newTotalVerified >= invoice.amount) {
                await invoiceModel.updateStatus(invoiceId, 'paid', conn);
            } else {
                await invoiceModel.updateStatus(invoiceId, 'partially_paid', conn);
            }

            // 7. Generate Receipt
            await receiptModel.create({
                paymentId: payId,
                invoiceId,
                tenantId: invoice.tenantId,
                amount: amountToApply,
                generatedDate: today(),
                receiptNumber: `REC-CREDIT-${randomUUID()}`,
            }, conn);

            // 8. Post Ledger Entry (Centralized classification)
            await this._postToLedger(
                payId,
                invoice,
                amountToApply,
                `Auto-applied credit from tenant balance to invoice #${invoiceId}`,
                conn
            );

            // 9. Notify Tenant
            await notificationModel.create({
                userId: invoice.tenantId,
                message: `LKR ${amountToApply} from your account balance was automatically applied to Invoice #${invoiceId}.`,
                type: 'payment',
            }, conn);

            if (!isExternalConn) await conn.commit();
            console.log(`[PaymentService] Auto-applied ${amountToApply} credit to Invoice #${invoiceId} for Tenant ${invoice.tenantId}`);

            return { paymentId: payId, amountApplied: amountToApply };

        } catch (error) {
            if (!isExternalConn) await conn.rollback();
            console.error(`[PaymentService] Failed to apply tenant credit to Invoice #${invoiceId}:`, error);
            throw error;
        } finally {
            if (!isExternalConn) conn.release();
        }
    }
}

export default new PaymentService();
