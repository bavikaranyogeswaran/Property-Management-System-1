import cron from 'node-cron';
import db from '../config/db.js';
import leaseModel from '../models/leaseModel.js';
import invoiceModel from '../models/invoiceModel.js';
import notificationModel from '../models/notificationModel.js';
import emailService from './emailService.js';
import { getCurrentDateString, getLocalTime, today, now, parseLocalDate, addDays, formatToLocalDate } from './dateUtils.js';

// --- CONFIGURATION ---
const RENT_DUE_DAY = 1; // 1st of each month
const GRACE_PERIOD_DAYS = 5;
const LATE_FEE_PERCENTAGE = 0.05;

export const generateRentInvoices = async () => {
  console.log('Running automated rent invoicing...');
  const currentToday = now();

  // ... (guards remain same)

  const currentYear = currentToday.getFullYear();
  const currentMonth = currentToday.getMonth() + 1; // 1-12
  
  const dueDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(RENT_DUE_DAY).padStart(2, '0')}`;

  try {
    const activeLeases = await leaseModel.findActive();
    console.log(`Found ${activeLeases.length} active leases.`);

    let createdCount = 0;
    for (const lease of activeLeases) {
      const leaseStart = parseLocalDate(lease.startDate);
      if (leaseStart > currentToday) {
        continue;
      }

      // Calculate effective rent for the billing month
      const billingDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const baseRent = await leaseModel.getEffectiveRent(lease.id, billingDate);
      
      let rentAmount = baseRent;
      let description = `Rent for ${currentYear}-${currentMonth}`;

      if (lease.endDate) {
        const endDate = parseLocalDate(lease.endDate);
        if (
          endDate.getFullYear() === currentYear &&
          endDate.getMonth() + 1 === currentMonth
        ) {
          const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
          const endDay = endDate.getDate();

          if (endDay < daysInMonth) {
            rentAmount =
              Math.round((baseRent / daysInMonth) * endDay * 100) /
              100;
            description += ` (Prorated: ${endDay}/${daysInMonth} days)`;
            console.log(
              `Prorating Final Month for Lease ${lease.id}: ${rentAmount}`
            );
          }
        }
      }

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
          amount: rentAmount,
          dueDate: dueDateStr,
          description: description,
          type: 'rent',
        });

        if (!invoiceId) {
          continue;
        }

        const tenantModel = (await import('../models/tenantModel.js')).default;
        const tenant = await tenantModel.findByUserId(lease.tenantId);

        if (tenant && tenant.creditBalance > 0) {
          const amountToApply = Math.min(tenant.creditBalance, rentAmount);

          if (amountToApply > 0) {
            const paymentModel = (await import('../models/paymentModel.js'))
              .default;

            const payId = await paymentModel.create({
              invoiceId,
              amount: amountToApply,
              paymentDate: today(),
              paymentMethod: 'credit_applied',
              referenceNumber: `CREDIT-${Date.now()}`,
              evidenceUrl: null,
            });
            await paymentModel.updateStatus(payId, 'verified');

            await tenantModel.deductCredit(lease.tenantId, amountToApply);

            if (amountToApply >= rentAmount) {
              await invoiceModel.updateStatus(invoiceId, 'paid');
            } else {
              await invoiceModel.updateStatus(invoiceId, 'partially_paid');
            }

            const receiptModel = (await import('../models/receiptModel.js')).default;
            const { randomUUID } = await import('crypto');
            await receiptModel.create({
              paymentId: payId,
              invoiceId,
              tenantId: lease.tenantId,
              amount: amountToApply,
              generatedDate: today(),
              receiptNumber: `REC-CREDIT-${randomUUID()}`,
            });

            console.log(
              `Auto-applied credit ${amountToApply} to Invoice ${invoiceId}. Remaining Credit: ${tenant.creditBalance - amountToApply}`
            );

            try {
              const ledgerModel = (await import('../models/ledgerModel.js')).default;
              await ledgerModel.create({
                paymentId: payId,
                invoiceId,
                leaseId: lease.id,
                accountType: 'revenue',
                category: 'rent',
                credit: Number(amountToApply),
                description: `Auto-applied credit from tenant balance to invoice #${invoiceId}`,
                entryDate: today(),
              });
            } catch (ledgerErr) {
              console.error('Failed to post ledger entry for auto-applied credit:', ledgerErr);
            }

            await notificationModel.create({
              userId: lease.tenantId,
              message: `A credit of LKR ${amountToApply} was automatically applied to your new rent invoice.`,
              type: 'payment',
              isRead: false,
            });
          }
        }

        await notificationModel.create({
          userId: lease.tenantId,
          message: `A new rent invoice for ${currentYear}-${currentMonth} has been generated. Due date: ${dueDateStr}`,
          type: 'invoice',
          isRead: false,
        });


        // Send Email
        // We need tenant email. Fetch from lease->tenant->user?
        // activeLeases query currently returns: `l.lease_id as id, l.unit_id, l.monthly_rent as monthlyRent, l.tenant_id as tenantId, u.unit_number as unitNumber`
        // It does NOT return email. We need to fetch email.
        try {
          const [userRows] = await db.query(
            'SELECT email FROM users WHERE user_id = ?',
            [lease.tenantId]
          );
          if (userRows.length > 0) {
            await emailService.sendInvoiceNotification(userRows[0].email, {
              amount: rentAmount,
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
  } catch (error) {
    console.error('Error in automated invoicing:', error);
  }
};

export const checkLeaseExpiration = async () => {
  console.log('Running lease expiration check...');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const currentToday = today();

    // 1. Find active leases past end date
    const [expiredLeases] = await connection.query(
      `
            SELECT l.lease_id, l.unit_id, p.owner_id 
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            WHERE l.status = 'active' AND l.end_date < ?
        `,
      [currentToday]
    );

    if (expiredLeases.length > 0) {
      console.log(`Found ${expiredLeases.length} expired leases.`);

      for (const lease of expiredLeases) {
        // Update Lease to 'ended'
        await connection.query(
          "UPDATE leases SET status = 'ended' WHERE lease_id = ?",
          [lease.lease_id]
        );

        // Update Unit to 'maintenance' (Turnover Buffer)
        // Instead of 'available' immediately.
        await connection.query(
          "UPDATE units SET status = 'maintenance' WHERE unit_id = ?",
          [lease.unit_id]
        );

        console.log(
          `Lease ${lease.lease_id} ended. Unit ${lease.unit_id} set to Maintenance (Turnover).`
        );

        // Notify Owner
        if (lease.owner_id) {
          await notificationModel.create({
            userId: lease.owner_id,
            message: `Lease for Unit ${lease.unit_id} has ended. Unit is now in Maintenance for turnover.`,
            type: 'lease',
            severity: 'info',
          });
        }

        // Notify Treasurers (Refund Alert)
        const treasurers = await db
          .query("SELECT user_id FROM users WHERE role = 'treasurer'")
          .then(([rows]) => rows);
        for (const t of treasurers) {
          await notificationModel.create({
            userId: t.user_id,
            message: `Lease #${lease.lease_id} has ended. Please process the Security Deposit Refund.`,
            type: 'lease',
            severity: 'warning',
          });
        }
      }
    }

    // 2. Process Turnover Buffer (Maintenance -> Available)
    // Find units in maintenance that had a lease end >= 3 days ago
    // AND do not have any active/pending maintenance requests (Safety check)
    const bufferDate = addDays(now(), -3);
    const bufferDateStr = formatToLocalDate(bufferDate);

    // Query: Units in 'maintenance' where LATEST lease end_date <= bufferDate
    // And NO active maintenance requests.
    const [turnoverUnits] = await connection.query(
      `
            SELECT u.unit_id 
            FROM units u
            JOIN leases l ON u.unit_id = l.unit_id
            WHERE u.status = 'maintenance'
            AND l.status = 'ended'
            AND l.end_date <= ?
            AND l.end_date = (SELECT MAX(end_date) FROM leases WHERE unit_id = u.unit_id)
            AND NOT EXISTS (
                SELECT 1 FROM maintenance_requests mr 
                WHERE mr.unit_id = u.unit_id 
                AND mr.status IN ('submitted', 'in_progress')
            )
        `,
      [bufferDateStr]
    );

    if (turnoverUnits.length > 0) {
      console.log(
        `Found ${turnoverUnits.length} units ready for Turnover (Maintenance -> Available).`
      );
      for (const u of turnoverUnits) {
        await connection.query(
          "UPDATE units SET status = 'available' WHERE unit_id = ?",
          [u.unit_id]
        );
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error('Error in lease expiration check:', error);
  } finally {
    connection.release();
  }
};

// Expiry Warning (Daily at 0:30 AM)
export const sendLeaseExpiryWarnings = async () => {
  console.log('Running lease expiry warning check...');
  // Warn at 30 and 60 days
  const currentToday = now();
  
  const dateStr30 = formatToLocalDate(addDays(currentToday, 30));
  const dateStr60 = formatToLocalDate(addDays(currentToday, 60));

  try {
    // Find leases expiring exactly in 30 or 60 days
    const [expiringLeases] = await db.query(
      `
            SELECT l.*, t.email as tenant_email, u_owner.email as owner_email, p.propertyName, un.unit_number
            FROM leases l
            JOIN users t ON l.tenant_id = t.user_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN properties p ON un.property_id = p.property_id
            LEFT JOIN users u_owner ON p.owner_id = u_owner.user_id
            WHERE l.status = 'active'
            AND l.end_date IN (?, ?)
        `,
      [dateStr30, dateStr60]
    );

    if (expiringLeases.length > 0) {
      console.log(
        `Found ${expiringLeases.length} leases expiring soon. Sending warnings...`
      );
      for (const lease of expiringLeases) {
        const daysCount = lease.end_date === dateStr30 ? 30 : 60;
        
        // 1. Notify Tenant
        await notificationModel.create({
          userId: lease.tenant_id,
          message: `Your lease is expiring in ${daysCount} days (on ${lease.end_date}). Please contact us if you wish to renew.`,
          type: 'system',
          severity: 'warning',
        });

        // 1b. Email Tenant
        if (lease.tenant_email) {
            await emailService.sendLeaseExpiryReminder(lease.tenant_email, {
                daysCount,
                endDate: lease.end_date,
                propertyName: lease.propertyName,
                unitNumber: lease.unit_number,
                role: 'tenant'
            });
        }

        // 2. Notify Owner
        if (lease.owner_id) {
          await notificationModel.create({
            userId: lease.owner_id,
            message: `Lease for Unit ${lease.unit_number} is expiring in ${daysCount} days (on ${lease.end_date}).`,
            type: 'system',
            severity: 'warning',
          });

          // 2b. Email Owner
          if (lease.owner_email) {
              await emailService.sendLeaseExpiryReminder(lease.owner_email, {
                  daysCount,
                  endDate: lease.end_date,
                  propertyName: lease.propertyName,
                  unitNumber: lease.unit_number,
                  role: 'owner'
              });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error sending expiry warnings:', error);
  }
};

// Late Fee Automation (Daily at 2:00 AM)
export const applyLateFees = async () => {
  console.log('Running late fee automation...');
  try {
    const overdueInvoices = await invoiceModel.findOverdue(GRACE_PERIOD_DAYS);
    console.log(
      `Found ${overdueInvoices.length} overdue invoices eligible for late fees.`
    );

    let appliedCount = 0;
    for (const inv of overdueInvoices) {
      // Fix 2: Calculate based on the Historical Invoice Amount, not current lease rent.
      const lateFeeAmount = inv.amount * LATE_FEE_PERCENTAGE;

      // Create Late Fee Invoice
      const lateFeeInvoiceId = await invoiceModel.createLateFeeInvoice({
        leaseId: inv.lease_id,
        amount: lateFeeAmount,
        dueDate: formatToLocalDate(addDays(now(), 5)), // 5-day grace period
        description: `Late Fee for Invoice #${inv.invoice_id} (${inv.year}-${inv.month})`,
      });

      // Auto-Apply Credits to Late Fee (consistent with rent invoice logic)
      const tenantModel = (await import('../models/tenantModel.js')).default;
      const tenant = await tenantModel.findByUserId(inv.tenant_id);

      if (tenant && tenant.creditBalance > 0) {
        const amountToApply = Math.min(tenant.creditBalance, lateFeeAmount);

        if (amountToApply > 0) {
          const paymentModel = (await import('../models/paymentModel.js')).default;

          // 1. Create Verified Payment
            const payId = await paymentModel.create({
              invoiceId: lateFeeInvoiceId,
              amount: amountToApply,
              paymentDate: today(),
              paymentMethod: 'credit_applied',
              referenceNumber: `CREDIT-LATEFEE-${Date.now()}`,
              evidenceUrl: null,
            });
          await paymentModel.updateStatus(payId, 'verified');

          // 2. Deduct Credit
          await tenantModel.deductCredit(inv.tenant_id, amountToApply);

          // 3. Update Invoice Status
          if (amountToApply >= lateFeeAmount) {
            await invoiceModel.updateStatus(lateFeeInvoiceId, 'paid');
          } else {
            await invoiceModel.updateStatus(lateFeeInvoiceId, 'partially_paid');
          }

          // 4. Generate Receipt
          const receiptModel = (await import('../models/receiptModel.js')).default;
          const { randomUUID } = await import('crypto');
            await receiptModel.create({
              paymentId: payId,
              invoiceId: lateFeeInvoiceId,
              tenantId: inv.tenant_id,
              amount: amountToApply,
              generatedDate: today(),
              receiptNumber: `REC-CREDIT-LATEFEE-${randomUUID()}`,
            });

          console.log(
            `Auto-applied credit ${amountToApply} to Late Fee Invoice ${lateFeeInvoiceId}. Remaining Credit: ${tenant.creditBalance - amountToApply}`
          );
        }
      }

      // Notify Tenant
      await notificationModel.create({
        userId: inv.tenant_id,
        message: `A late fee of LKR ${lateFeeAmount} has been applied to your account for overdue invoice #${inv.invoice_id}.`,
        type: 'invoice',
        isRead: false,
      });

      // Log Behavior (Negative)
      try {
        const behaviorLogModel = (await import('../models/behaviorLogModel.js')).default;
        await behaviorLogModel.create({
            tenantId: inv.tenant_id,
            type: 'negative',
            category: 'Payment',
            scoreChange: -10,
            description: `Late payment penalty for Invoice #${inv.invoice_id}`,
            recordedBy: null
        });
        await tenantModel.incrementBehaviorScore(inv.tenant_id, -10);
      } catch (scoreErr) {
        console.error('Failed to log negative behavior for late fee:', scoreErr);
      }

      // Logic Check: Mark Original Invoice as 'Overdue'
      // Previously, it remained 'pending'. Now explicitly set to 'overdue'.
      await invoiceModel.updateStatus(inv.invoice_id, 'overdue');

      // Send Email
      try {
        const [userRows] = await db.query(
          'SELECT email FROM users WHERE user_id = ?',
          [inv.tenant_id]
        );
        if (userRows.length > 0) {
          // We reuse sendInvoiceNotification or create a generic one?
          // sendInvoiceNotification expects { amount, dueDate, month, year, invoiceId }
          await emailService.sendInvoiceNotification(userRows[0].email, {
            amount: lateFeeAmount,
            dueDate: today(),
            month: inv.month,
            year: inv.year,
            invoiceId: 'LATE-FEE',
          });
        }
      } catch (emailErr) {
        console.error('Failed to send late fee email:', emailErr);
      }

      // Logic Fix: Sync Behavior Score (Deduct 10 points)
      try {
        const scoreChange = -10;
        // Import locally if not at top, or assume available.
        // We need to dynamic import if not readily available or add to top.
        // Let's add dynamic imports for safety inside the loop/function or better yet, just use pool/db if models aren't easy.
        // But we used invoiceModel so models should be fine.
        // We'll use the raw queries or models. Let's use models pattern if possible.
        // But cronJobs.js has imports at top. Let's check imports.
        // I will add the logic using DB queries directly for speed/safety like in the controller example.

        // 1. Create Log
        // We need behaviorLogModel. Let's use direct DB insert to avoid circular dep issues or import mess.
        await db.query(
          `
                    INSERT INTO tenant_behavior_logs (tenant_id, type, category, score_change, description, recorded_by, created_at)
                    VALUES (?, 'negative', 'Payment', ?, ?, NULL, NOW())
                `,
          [
            inv.tenant_id,
            scoreChange,
            `Late Fee applied for Invoice #${inv.invoice_id}`,
          ]
        );

        // 2. Update Tenant Score
        await db.query(
          'UPDATE tenants SET behavior_score = LEAST(100, GREATEST(0, behavior_score + ?)) WHERE user_id = ?',
          [scoreChange, inv.tenant_id]
        );
        console.log(
          `Auto-deducted 10 points for Tenant ${inv.tenant_id} due to late fee.`
        );
      } catch (scoreErr) {
        console.error(
          'Failed to update behavior score on auto-late fee:',
          scoreErr
        );
      }

      appliedCount++;
    }
    console.log(`Applied late fees to ${appliedCount} invoices.`);
  } catch (error) {
    console.error('Error in late fee automation:', error);
  }
};

// Unit Status Sync (Daily at 3:00 AM)
// Fixes the "Gap Period" bug: Ensure units with Active leases are marked Occupied.
export const syncUnitStatuses = async () => {
  console.log('Running unit status synchronization...');
  try {
    const currentToday = today();

    // 1. Find Units marked 'available' that actually have an Active Lease covering Today
    // This handles the case where Lease A ended (Unit->Available) > Gap > Lease B starts (Unit stays Available?? No, we fix it here).
    const [incorrectAvailable] = await db.query(
      `
            SELECT u.unit_id 
            FROM units u
            JOIN leases l ON u.unit_id = l.unit_id
            WHERE u.status = 'available'
            AND l.status = 'active'
            AND l.start_date <= ?
            AND l.end_date >= ?
        `,
      [currentToday, currentToday]
    );

    if (incorrectAvailable.length > 0) {
      console.log(
        `Found ${incorrectAvailable.length} units falsely marked 'available'. Correcting to 'occupied'...`
      );
      const ids = incorrectAvailable.map((u) => u.unit_id);
      await db.query(
        `UPDATE units SET status = 'occupied' WHERE unit_id IN (?)`,
        [ids]
      );
    }

    // 2. Find Units marked 'occupied' that satisfy NO active lease condition?
    // "Ghost Tenant" Cleanup: find units that are 'occupied' but have no lease that is active today
    const [ghostOccupied] = await db.query(
      `
            SELECT u.unit_id 
            FROM units u
            WHERE u.status = 'occupied'
            AND NOT EXISTS (
                SELECT 1 FROM leases l
                WHERE l.unit_id = u.unit_id
                AND l.status = 'active'
                AND l.start_date <= ?
                AND l.end_date >= ?
            )
        `,
      [currentToday, currentToday]
    );

    if (ghostOccupied.length > 0) {
      console.log(
        `Found ${ghostOccupied.length} "Ghost" units falsely marked 'occupied' (no active lease). Correcting to 'available'...`
      );
      const ids = ghostOccupied.map((u) => u.unit_id);
      await db.query(
        `UPDATE units SET status = 'available' WHERE unit_id IN (?)`,
        [ids]
      );
    }
  } catch (error) {
    console.error('Error syncing unit statuses:', error);
  }
};

// Rent Reminder (Daily at 8:00 AM)
export const sendRentReminders = async () => {
  const currentToday = now();
  const targetDay = RENT_DUE_DAY - 3;
  
  if (currentToday.getDate() !== targetDay) return;

  console.log('Running automated rent reminders...');
  try {
    const activeLeases = await leaseModel.findActive();
    const dueDate = `${currentToday.getFullYear()}-${String(currentToday.getMonth() + 1).padStart(2, '0')}-${String(RENT_DUE_DAY).padStart(2, '0')}`;

    for (const lease of activeLeases) {
        // Fetch tenant email
        const [userRows] = await db.query('SELECT email FROM users WHERE user_id = ?', [lease.tenantId]);
        if (userRows.length > 0 && userRows[0].email) {
            await emailService.sendRentReminder(userRows[0].email, {
                amount: lease.monthlyRent,
                dueDate: dueDate,
                daysLeft: 3
            });
        }
    }
  } catch (error) {
    console.error('Error in automated rent reminders:', error);
  }
};

// Notification Cleanup (Daily at 4:00 AM)
// Prevents unbounded growth of the notifications table
export const cleanupOldNotifications = async () => {
  console.log('Running notification cleanup...');
  try {
    const notificationModel = (await import('../models/notificationModel.js')).default;

    // Delete read notifications older than 30 days
    const readDeleted = await notificationModel.deleteOlderThan(30);
    console.log(`Cleaned up ${readDeleted} notifications older than 30 days.`);
  } catch (error) {
    console.error('Error in notification cleanup:', error);
  }
};

const initCronJobs = () => {
  // Run every day at 0:30 AM (Expiry Warnings)
  cron.schedule('30 0 * * *', sendLeaseExpiryWarnings);

  // Run every day at midnight (Lease Expiry)
  cron.schedule('0 0 * * *', checkLeaseExpiration);

  // Run every day at 1:00 AM (Invoicing)
  cron.schedule('0 1 * * *', generateRentInvoices);

  // Run every day at 2:00 AM (Late Fees)
  cron.schedule('0 2 * * *', applyLateFees);

  // Run every day at 3:00 AM (Unit Status Sync)
  cron.schedule('0 3 * * *', syncUnitStatuses);

  // Run every day at 4:00 AM (Notification Cleanup)
  cron.schedule('0 4 * * *', cleanupOldNotifications);

  // Run every day at 8:00 AM (Rent Reminders)
  cron.schedule('0 8 * * *', sendRentReminders);
};

export default initCronJobs;
