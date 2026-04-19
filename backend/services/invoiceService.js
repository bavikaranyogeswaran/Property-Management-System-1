// ============================================================================
//  INVOICE SERVICE (The Billing Logic)
// ============================================================================
//  This service calculates the amounts for bills.
//  It handles monthly rent generation, manual invoice creation,
//  and corrections for billing errors.
// ============================================================================

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
import auditLogger from '../utils/auditLogger.js';
import { toCentsFromMajor } from '../utils/moneyUtils.js';
import {
  getCurrentDateString,
  getLocalTime,
  parseLocalDate,
  now,
} from '../utils/dateUtils.js';
import { runWithLock } from '../utils/distributionLock.js';
import { isAtLeast, ROLES } from '../utils/roleUtils.js';

class InvoiceService {
  async getInvoices(user) {
    if (user.role === ROLES.TENANT) {
      return await invoiceModel.findByTenantId(user.id);
    } else if (user.role === ROLES.TREASURER) {
      return await invoiceModel.findByTreasurerId(user.id);
    } else if (user.role === ROLES.OWNER) {
      return await invoiceModel.findByOwnerId(user.id);
    } else {
      throw new Error('Access denied');
    }
  }

  // CREATE INVOICE: Manually generates a one-off bill (e.g., for repairs or late fees).
  async createInvoice(data, user) {
    if (!isAtLeast(user.role, ROLES.TREASURER)) {
      throw new Error('Denied. Only Treasurers can create invoices.');
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // RBAC Check: Ensure treasurer is assigned to this property
      const lease = await leaseModel.findById(data.leaseId, connection);
      if (!lease) throw new Error('Lease not found');

      const assigned = await staffModel.getAssignedProperties(user.id);
      const assignedPropertyIds = assigned.map((p) => p.id.toString());

      if (!assignedPropertyIds.includes(lease.propertyId.toString())) {
        throw new Error(
          'Access denied. You are not assigned to this property.'
        );
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
            isPaid: finalInvoice.status === 'paid',
          });
        } catch (emailErr) {
          console.error(
            '[InvoiceService] Failed to send invoice notification email:',
            emailErr
          );
        }
      }

      return invoiceId;
    } catch (error) {
      await connection.rollback();
      console.error(
        '[InvoiceService] Create Invoice Transaction Failed:',
        error
      );
      throw error;
    } finally {
      connection.release();
    }
  }

  // GENERATE MONTHLY INVOICES: The heavy-lifter. Calculates rent for all active tenants at the start of the month.
  async generateMonthlyInvoices(year, month, user) {
    if (!isAtLeast(user.role, ROLES.TREASURER)) {
      throw new Error('Access denied. Only Treasurers can generate invoices.');
    }

    const nowTime = getLocalTime();
    const y = year || nowTime.getFullYear();
    const m = month || nowTime.getMonth() + 1;

    // 1. CONCURRENCY LOCK: Prevent multiple simultaneous bulk generations
    // [HARDENED] Migrated to Redis Distributed Lock to avoid SQL row-locking overhead
    const lockName = `generate_invoices_${y}_${m}`;

    const lockResult = await runWithLock(lockName, 900, async () => {
      const activeLeases = await leaseModel.findActive();

      // RBAC: Treasurer assignments
      const assigned = await staffModel.getAssignedProperties(user.id);
      const assignedPropertyIds = assigned.map((p) => p.property_id.toString());
      const targetLeases = activeLeases.filter((l) =>
        assignedPropertyIds.includes(l.propertyId.toString())
      );

      let generatedCount = 0;
      let skippedCount = 0;

      // [HARDENED] Chunked Processing: Process in batches of 20 to prevent request timeouts
      const CHUNK_SIZE = 20;
      for (let i = 0; i < targetLeases.length; i += CHUNK_SIZE) {
        const chunk = targetLeases.slice(i, i + CHUNK_SIZE);

        await Promise.all(
          chunk.map(async (lease) => {
            const leaseStart = parseLocalDate(lease.startDate);
            leaseStart.setHours(0, 0, 0, 0);

            const targetMonthStart = parseLocalDate(
              `${y}-${String(m).padStart(2, '0')}-01`
            );
            targetMonthStart.setHours(0, 0, 0, 0);

            if (leaseStart > targetMonthStart) {
              skippedCount++;
              return;
            }

            const exists = await invoiceModel.exists(lease.id, y, m);
            if (exists) {
              skippedCount++;
              return;
            }

            const billingInfo = billingEngine.calculateMonthlyRent(lease, y, m);
            if (!billingInfo) {
              skippedCount++;
              return;
            }

            const invoiceId = await invoiceModel.create({
              leaseId: lease.id,
              amount: billingInfo.amount,
              dueDate: billingInfo.dueDate,
              description: billingInfo.description,
            });

            // [FIX] Guard: Only apply credit and send email if invoice was actually created (not a duplicate)
            if (invoiceId) {
              // Auto-apply credit if exists
              try {
                await paymentService.applyTenantCredit(invoiceId);
              } catch (err) {
                console.error(
                  `[InvoiceService] Failed to auto-apply credit to generated invoice ${invoiceId}:`,
                  err
                );
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
                    entityType: 'invoice',
                    entityId: invoiceId,
                  });
                }
              } catch (err) {
                console.error(
                  `Failed to send email for invoice ${invoiceId}:`,
                  err
                );
              }

              generatedCount++;
            } else {
              skippedCount++;
            }
          })
        );

        // Small delay between chunks to yield to event loop
        if (i + CHUNK_SIZE < targetLeases.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // 3. LOG COMPLETION: Persistent state for backfill/audit
      await db.query(
        `INSERT INTO cron_checkpoints (job_name, last_success_date, status, message) 
         VALUES (?, ?, 'success', ?)
         ON DUPLICATE KEY UPDATE status = 'success', updated_at = NOW(), message = ?, last_success_date = VALUES(last_success_date)`,
        [
          lockName,
          `${y}-${String(m).padStart(2, '0')}-01`,
          `Generated ${generatedCount} invoices manually`,
          `Generated ${generatedCount} invoices manually`,
        ]
      );

      return { generated: generatedCount, skipped: skippedCount };
    });

    if (!lockResult.success) {
      throw new Error(
        'Invoice generation for this period is already in progress. Please wait.'
      );
    }

    return lockResult.result;
  }

  // CORRECT INVOICE: Voids a wrong bill and issues a new one with the correct amount.
  async correctInvoice(invoiceId, newAmount, reason, user) {
    if (!isAtLeast(user.role, ROLES.TREASURER))
      throw new Error('Only treasurers can correct invoices.');

    const invoice = await invoiceModel.findById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status === 'paid')
      throw new Error('Cannot correct a paid invoice.');

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Void the original
      await invoiceModel.updateStatus(invoiceId, 'void', connection);

      // 2. Create replacement
      const newInvoiceId = await invoiceModel.create(
        {
          leaseId: invoice.leaseId || invoice.lease_id,
          amount: Number(newAmount),
          dueDate: invoice.dueDate || invoice.due_date,
          description: `[CORRECTED] ${invoice.description}`,
          type: invoice.invoiceType || invoice.invoice_type,
        },
        connection
      );

      // 3. Audit log

      await auditLogger.log(
        {
          userId: user.id || user.user_id,
          actionType: 'INVOICE_CORRECTED',
          entityId: invoiceId,
          entityType: 'invoice',
          details: {
            originalAmount: invoice.amount,
            newAmount: Number(newAmount),
            newInvoiceId,
            reason,
          },
        },
        null,
        connection
      );

      await connection.commit();
      return { voidedInvoiceId: invoiceId, newInvoiceId };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async updateStatus(id, status, user) {
    if (!isAtLeast(user.role, ROLES.TREASURER)) {
      throw new Error(
        'Access denied. Only Treasurers can update invoice status.'
      );
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
        throw new Error(
          'Cannot mark as overdue. A payment is pending verification.'
        );
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
        await tenantModel.incrementBehaviorScore(
          invoice.tenant_id,
          scoreChange
        );
      } catch (err) {
        console.error('Failed to update behavior score:', err);
      }
    }

    return updatedInvoice;
  }
}

export default new InvoiceService();
