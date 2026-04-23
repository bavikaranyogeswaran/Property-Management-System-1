// ============================================================================
//  BILLING JOBS (Rent Invoicing & Late Fee Automation)
// ============================================================================

import db from '../db.js';
import leaseModel from '../../models/leaseModel.js';
import invoiceModel from '../../models/invoiceModel.js';
import notificationModel from '../../models/notificationModel.js';
import emailService from '../emailService.js';
import tenantModel from '../../models/tenantModel.js';
import billingEngine from '../billingEngine.js';
import paymentService from '../../services/paymentService.js';
import { now, formatToLocalDate, addDays } from '../dateUtils.js';
import { moneyMath, fromCents } from '../moneyUtils.js';
import { runWithLock } from '../distributionLock.js';

const LATE_FEE_PERCENTAGE = 0.03;

export const generateRentInvoices = async () => {
  console.log('Running automated rent invoicing...');
  const currentToday = now();

  const currentYear = currentToday.getFullYear();
  const currentMonth = currentToday.getMonth() + 1; // 1-12

  const lockName = `generate_invoices_${currentYear}_${currentMonth}`;

  const lockResult = await runWithLock(lockName, 1800, async () => {
    const activeLeases = await leaseModel.findActive();
    console.log(`Found ${activeLeases.length} active leases.`);

    let createdCount = 0;
    for (const lease of activeLeases) {
      const adjustments = await leaseModel.getAdjustments(lease.id);
      const leaseRentInfo = billingEngine.calculateMonthlyRent(
        lease,
        currentYear,
        currentMonth,
        adjustments
      );

      if (!leaseRentInfo) continue;
      const dueDateStr = leaseRentInfo.dueDate;

      const exists = await invoiceModel.exists(
        lease.id,
        currentYear,
        currentMonth,
        'rent'
      );
      if (!exists) {
        console.log(
          `Creating invoice for Lease ${lease.id} (Unit ${lease.unitNumber})...`
        );
        const invoiceId = await invoiceModel.create({
          leaseId: lease.id,
          amount: leaseRentInfo.amount,
          dueDate: leaseRentInfo.dueDate,
          description: leaseRentInfo.description,
          type: 'rent',
        });

        if (!invoiceId) {
          continue;
        }

        try {
          await paymentService.applyTenantCredit(invoiceId);
        } catch (err) {
          console.error(
            `[Cron] Failed to auto-apply credit to generated rent invoice ${invoiceId}:`,
            err
          );
        }

        await notificationModel.create({
          userId: lease.tenantId,
          message: `A new rent invoice for ${currentYear}-${currentMonth} has been generated. Due date: ${dueDateStr}`,
          type: 'invoice',
          isRead: false,
        });

        try {
          const [userRows] = await db.query(
            'SELECT email FROM users WHERE user_id = ?',
            [lease.tenantId]
          );
          if (userRows.length > 0) {
            await emailService.sendInvoiceNotification(userRows[0].email, {
              amount: fromCents(leaseRentInfo.amount),
              dueDate: dueDateStr,
              month: currentMonth,
              year: currentYear,
              invoiceId: invoiceId,
            });
          }
        } catch (emailErr) {
          console.error('Failed to send invoice email:', emailErr);
        }

        createdCount++;
      }
    }
    console.log(`Automated Invoicing: Created ${createdCount} new invoices.`);

    await db.query(
      `INSERT INTO cron_checkpoints (job_name, last_success_date, status, message) 
         VALUES (?, ?, 'success', ?)
         ON DUPLICATE KEY UPDATE status = 'success', updated_at = NOW(), message = ?`,
      [
        lockName,
        `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`,
        `Automated generation complete: ${createdCount} created`,
        `Automated generation complete: ${createdCount} created`,
      ]
    );

    return createdCount;
  });

  if (!lockResult.success) {
    console.log(
      `[Cron] Skipping Rent Invoicing: A process for "${lockName}" is already running.`
    );
    return;
  }
};

export const applyLateFees = async () => {
  const currentToday = now();
  const lockName = `apply_late_fees_${currentToday.getFullYear()}_${currentToday.getMonth() + 1}_${currentToday.getDate()}`;

  const lockResult = await runWithLock(lockName, 1800, async () => {
    console.log('Running late fee automation...');
    const todayStr = formatToLocalDate(currentToday);

    try {
      const overdueInvoices = await invoiceModel.findOverdue();
      console.log(
        `Found ${overdueInvoices.length} overdue invoices eligible for late fee checks.`
      );

      let appliedCount = 0;
      for (const inv of overdueInvoices) {
        const isDaily = inv.lateFeeType === 'daily_fixed';

        if (isDaily) {
          const [existingFee] = await db.query(
            "SELECT invoice_id, amount, description FROM rent_invoices WHERE lease_id = ? AND description LIKE ? AND invoice_type = 'late_fee' LIMIT 1",
            [inv.lease_id, `%Late Fee for Invoice #${inv.invoice_id}%`]
          );

          const dailyAmount = inv.lateFeeAmount || 0;
          if (dailyAmount <= 0) continue;

          if (existingFee.length > 0) {
            const feeInv = existingFee[0];

            if (feeInv.description.includes(todayStr)) {
              console.log(
                `Daily fee already applied for Invoice #${inv.invoice_id} on ${todayStr}. Skipping.`
              );
              continue;
            }

            const newAmount = Number(feeInv.amount) + dailyAmount;
            const newDescription = feeInv.description + `, ${todayStr}`;

            await db.query(
              'UPDATE rent_invoices SET amount = ?, description = ? WHERE invoice_id = ?',
              [newAmount, newDescription, feeInv.invoice_id]
            );

            await paymentService.applyTenantCredit(feeInv.invoice_id);
            appliedCount++;
          } else {
            const lateFeeInvoiceId = await invoiceModel.createLateFeeInvoice({
              leaseId: inv.lease_id,
              amount: dailyAmount,
              dueDate: formatToLocalDate(addDays(now(), 1)),
              description: `Accumulated Late Fee for Invoice #${inv.invoice_id} starting ${todayStr}`,
              year: inv.year,
              month: inv.month,
            });

            if (lateFeeInvoiceId) {
              await paymentService.applyTenantCredit(lateFeeInvoiceId);
              appliedCount++;
            }
          }
        } else {
          const [feeExists] = await db.query(
            "SELECT 1 FROM rent_invoices WHERE lease_id = ? AND description LIKE ? AND invoice_type = 'late_fee' AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY) LIMIT 1",
            [inv.lease_id, `%Late Fee for Invoice #${inv.invoice_id}%`]
          );

          if (feeExists.length > 0) {
            console.log(
              `Flat late fee already exists for Invoice #${inv.invoice_id} in last 30 days. Skipping.`
            );
            continue;
          }

          const feePercentage =
            inv.lateFeePercentage !== null
              ? inv.lateFeePercentage / 100
              : LATE_FEE_PERCENTAGE;
          const flatFeeAmount = moneyMath(inv.amount)
            .mul(feePercentage)
            .round()
            .value();

          const lateFeeInvoiceId = await invoiceModel.createLateFeeInvoice({
            leaseId: inv.lease_id,
            amount: flatFeeAmount,
            dueDate: formatToLocalDate(addDays(now(), 5)),
            description: `Late Fee for Invoice #${inv.invoice_id} (${inv.year}-${inv.month})`,
          });

          if (lateFeeInvoiceId) {
            await paymentService.applyTenantCredit(lateFeeInvoiceId);
            appliedCount++;
          }
        }

        const lastAppliedFee = await db
          .query(
            "SELECT amount, invoice_id FROM rent_invoices WHERE lease_id = ? AND invoice_type = 'late_fee' ORDER BY created_at DESC LIMIT 1",
            [inv.lease_id]
          )
          .then(([rows]) => rows[0]);

        if (lastAppliedFee) {
          await notificationModel.create({
            userId: inv.tenant_id,
            message: `A ${isDaily ? 'daily ' : ''}late fee of LKR ${fromCents(lastAppliedFee.amount).toFixed(2)} has been applied to your account for overdue invoice #${inv.invoice_id}.`,
            type: 'invoice',
            isRead: false,
          });

          const [firstFee] = await db.query(
            "SELECT 1 FROM rent_invoices WHERE lease_id = ? AND description LIKE ? AND invoice_type = 'late_fee' LIMIT 2",
            [inv.lease_id, `%Invoice #${inv.invoice_id}%`]
          );

          if (firstFee.length === 1) {
            try {
              const behaviorLogModel = (
                await import('../../models/behaviorLogModel.js')
              ).default;
              await behaviorLogModel.create({
                tenantId: inv.tenant_id,
                type: 'negative',
                category: 'Payment',
                scoreChange: -10,
                description: `Initial late payment penalty for Invoice #${inv.invoice_id}`,
                recordedBy: null,
              });
              await tenantModel.incrementBehaviorScore(inv.tenant_id, -10);
            } catch (scoreErr) {
              console.error('Failed to log negative behavior:', scoreErr);
            }
          }

          if (inv.status === 'pending') {
            await invoiceModel.updateStatus(inv.invoice_id, 'overdue');
          }
        }
      }
      console.log(
        `Finished checking late fees. Applied ${appliedCount} new fees.`
      );
    } catch (error) {
      console.error('Error in late fee automation:', error);
    }
  });

  if (!lockResult.success) {
    console.log(
      `[Cron] Skipping Late Fees: A process for "${lockName}" is already running.`
    );
  }
};
