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
  // FETCH INVOICES: Retrieves a list of bills filtered for the specific viewer (Staff/Tenant/Owner).
  async getInvoices(user) {
    if (user.role === ROLES.TENANT)
      return await invoiceModel.findByTenantId(user.id);
    if (user.role === ROLES.TREASURER)
      return await invoiceModel.findByTreasurerId(user.id);
    if (user.role === ROLES.OWNER)
      return await invoiceModel.findByOwnerId(user.id);
    throw new Error('Access denied');
  }

  // CREATE INVOICE: Manually generates a one-off bill for a lease.
  async createInvoice(data, user) {
    // 1. [SECURITY] RBAC and property assignment check
    if (!isAtLeast(user.role, ROLES.TREASURER))
      throw new Error('Denied. Only Treasurers can create invoices.');

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const lease = await leaseModel.findById(data.leaseId, connection);
      if (!lease) throw new Error('Lease not found');

      const assigned = await staffModel.getAssignedProperties(user.id);
      if (
        !assigned.some((p) => p.id.toString() === lease.propertyId.toString())
      ) {
        throw new Error(
          'Access denied. You are not assigned to this property.'
        );
      }

      // 2. Insert invoice record
      const invoiceId = await invoiceModel.create(data, connection);

      // 3. [FINANCIAL] Auto-settle: check if tenant has prepaid credit to apply to this new debt
      if (invoiceId)
        await paymentService.applyTenantCredit(invoiceId, connection);

      await connection.commit();

      // 4. [SIDE EFFECT] Deliver notification to tenant (Non-blocking)
      const finalInvoice = await invoiceModel.findById(invoiceId);
      const tenant = await userModel.findById(lease.tenantId);
      if (tenant?.email) {
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
        } catch (e) {
          console.error('Invoice email failed:', e);
        }
      }

      return invoiceId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // GENERATE MONTHLY INVOICES: Bulk process at month-start to bill all active leases.
  async generateMonthlyInvoices(year, month, user) {
    // 1. [SECURITY] Role check
    if (!isAtLeast(user.role, ROLES.TREASURER))
      throw new Error('Access denied.');

    const nowTime = getLocalTime();
    const y = year || nowTime.getFullYear();
    const m = month || nowTime.getMonth() + 1;

    // 2. [CONCURRENCY] Acquire distributed lock to prevent dual generation runs
    const lockName = `generate_invoices_${y}_${m}`;

    const lockResult = await runWithLock(lockName, 900, async () => {
      // 3. Filter leases based on Staff assignment
      const activeLeases = await leaseModel.findActive();
      const assigned = await staffModel.getAssignedProperties(user.id);
      const assignedIds = assigned.map((p) => p.property_id.toString());
      const targetLeases = activeLeases.filter((l) =>
        assignedIds.includes(l.propertyId.toString())
      );

      let generatedCount = 0;
      let skippedCount = 0;

      // 4. Batch Processing: Avoid event loop starvation with small chunks
      const CHUNK_SIZE = 20;
      for (let i = 0; i < targetLeases.length; i += CHUNK_SIZE) {
        const chunk = targetLeases.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (lease) => {
            // Idempotency check: don't double bill
            const exists = await invoiceModel.exists(lease.id, y, m);
            if (exists) {
              skippedCount++;
              return;
            }

            // Calculate amount (handles pro-rata etc.) via BillingEngine
            const billing = billingEngine.calculateMonthlyRent(lease, y, m);
            if (!billing) {
              skippedCount++;
              return;
            }

            const invoiceId = await invoiceModel.create({
              leaseId: lease.id,
              amount: billing.amount,
              dueDate: billing.dueDate,
              description: billing.description,
            });

            if (invoiceId) {
              // [FINANCIAL] Auto-apply prepaid credits
              try {
                await paymentService.applyTenantCredit(invoiceId);
              } catch (e) {
                console.error('Credit application failed:', e);
              }

              // [SIDE EFFECT] Deliver email to tenant
              try {
                const tenant = await userModel.findById(lease.tenantId);
                if (tenant?.email)
                  await emailService.sendInvoiceNotification(tenant.email, {
                    amount: billing.amount,
                    dueDate: billing.dueDate,
                    month: m,
                    year: y,
                    invoiceId,
                  });
              } catch (e) {
                console.error('Invoice notification failed:', e);
              }
              generatedCount++;
            } else {
              skippedCount++;
            }
          })
        );

        if (i + CHUNK_SIZE < targetLeases.length)
          await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // 5. [AUDIT] Track job completion in cron_checkpoints
      await db.query(
        `INSERT INTO cron_checkpoints (job_name, last_success_date, status, message) VALUES (?, ?, 'success', ?) ON DUPLICATE KEY UPDATE status = 'success', updated_at = NOW(), message = VALUES(message)`,
        [
          lockName,
          `${y}-${String(m).padStart(2, '0')}-01`,
          `Manually generated ${generatedCount} invoices.`,
        ]
      );

      return { generated: generatedCount, skipped: skippedCount };
    });

    if (!lockResult.success) throw new Error('Generation already in progress.');
    return lockResult.result;
  }

  // CORRECT INVOICE: Correction tool for billing errors. Voids original and issues a new one.
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

      // 1. Transactionally void the erroneous invoice
      await invoiceModel.updateStatus(invoiceId, 'void', connection);

      // 2. Issue replacement invoice
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

      // 3. [AUDIT] Log the correction trail
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

  // UPDATE STATUS: Manual lifecycle management for invoices (e.g., marking overdue).
  async updateStatus(id, status, user) {
    // 1. [SECURITY] Role and Property Assignment Check
    if (!isAtLeast(user.role, ROLES.TREASURER))
      throw new Error('Access denied.');

    const invoice = await invoiceModel.findById(id);
    if (!invoice) throw new Error('Invoice not found');
    const lease = await leaseModel.findById(invoice.leaseId);
    if (!lease) throw new Error('Lease context missing');

    const assigned = await staffModel.getAssignedProperties(user.id);
    if (
      !assigned.some((p) => p.id.toString() === lease.propertyId.toString())
    ) {
      throw new Error('Access denied. You are not assigned to this property.');
    }

    const oldStatus = invoice.status;

    // 2. [VALIDATION] Prevent marking as overdue if due date hasn't passed or payment is pending
    if (status === 'overdue') {
      const dueDate = parseLocalDate(invoice.due_date);
      const currentToday = now();
      currentToday.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);

      if (currentToday <= dueDate)
        throw new Error('Cannot mark overdue before due date.');

      const payments = await paymentModel.findByInvoiceId(id);
      if (payments.some((p) => p.status === 'pending'))
        throw new Error('Payment pending verification.');
    }

    // 3. Apply state change
    const updatedInvoice = await invoiceModel.updateStatus(id, status);

    // 4. [SIDE EFFECT] Update Lease deposit status if a security deposit was just paid
    if (status === 'paid' && invoice.invoice_type === 'deposit') {
      await leaseModel.update(invoice.lease_id, { depositStatus: 'paid' });
    }

    // 5. [BEHAVIOR] Penalize tenant behavior score for overdue status
    if (status === 'overdue' && oldStatus !== 'overdue') {
      try {
        const scoreChange = -10;
        await behaviorLogModel.create({
          tenantId: invoice.tenant_id,
          type: 'negative',
          category: 'Payment',
          scoreChange,
          description: `Invoice #${id} overdue.`,
          recordedBy: user.id,
        });
        await tenantModel.incrementBehaviorScore(
          invoice.tenant_id,
          scoreChange
        );
      } catch (err) {
        console.error('Behavior score update failed:', err);
      }
    }

    return updatedInvoice;
  }
}

export default new InvoiceService();
