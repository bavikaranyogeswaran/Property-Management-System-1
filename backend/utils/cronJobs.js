import cron from 'node-cron';
import db from '../config/db.js';
import leaseModel from '../models/leaseModel.js';
import invoiceModel from '../models/invoiceModel.js';
import notificationModel from '../models/notificationModel.js';
import emailService from './emailService.js';

// Configuration Constants
const RENT_DUE_DAY = parseInt(process.env.RENT_DUE_DAY) || 5; // Day of the month rent is due
const GRACE_PERIOD_DAYS = parseInt(process.env.GRACE_PERIOD_DAYS) || 5; // Days after due date before late fees apply
const LATE_FEE_PERCENTAGE = parseFloat(process.env.LATE_FEE_PERCENTAGE) || 0.05; // 5% of invoice amount

export const generateRentInvoices = async () => {
  console.log('Running automated rent invoicing...');
  const today = new Date();

  // Check if it's the 1st of the month (or for testing purposes, we assume checks are safe to run anytime due to existence check)
  // Production: if (today.getDate() !== 1) return;

  // We'll leave the date check commented out for easier testing/demos, OR enforce it but export a force mode.
  // For this implementation, I will enforcing the check but skip it if running via manual function call in tests?
  // Actually, usually cron runs blindly. The logic inside should guard.
  // Let's implement: Run ANY day, but only create if missing for THIS month.
  // This makes it robust (if server is down on 1st, it catches up on 2nd).

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-12
  const dueDate = new Date(today.getFullYear(), today.getMonth(), RENT_DUE_DAY);

  try {
    const activeLeases = await leaseModel.findActive(); // Should return all active (and pending? no only active)
    console.log(`Found ${activeLeases.length} active leases.`);

    let createdCount = 0;
    for (const lease of activeLeases) {
      // Logic Check: Prevent Premature Billing
      // If the lease starts in the future, do not invoice yet.
      // This handles cases where a lease is signed and 'active' but the move-in date hasn't arrived.
      const leaseStart = new Date(lease.startDate);
      if (leaseStart > today) {
        // console.log(`Skipping Lease ${lease.id} (Future Start: ${lease.startDate})`);
        continue;
      }

      // Proration Logic For Last Month
      let rentAmount = lease.monthlyRent;
      let description = `Rent for ${currentYear}-${currentMonth}`;

      // Check if lease ends this month
      if (lease.endDate) {
        const endDate = new Date(lease.endDate);
        if (
          endDate.getFullYear() === currentYear &&
          endDate.getMonth() + 1 === currentMonth
        ) {
          const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
          const endDay = endDate.getDate();

          if (endDay < daysInMonth) {
            rentAmount =
              Math.round((lease.monthlyRent / daysInMonth) * endDay * 100) /
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
          dueDate: dueDate.toISOString().split('T')[0],
          description: description,
          type: 'rent',
        });

        // Logic Fix: Auto-Apply Credits
        const tenantModel = (await import('../models/tenantModel.js')).default;
        // Fetch fresh tenant data (specifically credit balance)
        const tenant = await tenantModel.findByUserId(lease.tenantId);

        if (tenant && tenant.creditBalance > 0) {
          const amountToApply = Math.min(tenant.creditBalance, rentAmount);

          if (amountToApply > 0) {
            const paymentModel = (await import('../models/paymentModel.js'))
              .default;

            // 1. Create Verified Payment
            const payId = await paymentModel.create({
              invoiceId,
              amount: amountToApply,
              paymentDate: new Date(),
              paymentMethod: 'credit_applied',
              referenceNumber: `CREDIT-${Date.now()}`,
              evidenceUrl: null,
            });
            await paymentModel.updateStatus(payId, 'verified');

            // 2. Deduct Credit
            await tenantModel.deductCredit(lease.tenantId, amountToApply);

            // 3. Update Invoice Status
            // Logic simplified: If applied starts == rentAmount, it's paid.
            // But we should use the standard 'verifyPayment' check logic or just update manually.
            // verifyPayment controller logic is safer but we are in cron.
            // Simple Update:
            if (amountToApply >= rentAmount) {
              await invoiceModel.updateStatus(invoiceId, 'paid');
            } else {
              await invoiceModel.updateStatus(invoiceId, 'partially_paid');
            }

            // 4. Generate Receipt for the credit-applied payment
            const receiptModel = (await import('../models/receiptModel.js')).default;
            const { randomUUID } = await import('crypto');
            await receiptModel.create({
              paymentId: payId,
              invoiceId,
              tenantId: lease.tenantId,
              amount: amountToApply,
              generatedDate: new Date().toISOString(),
              receiptNumber: `REC-CREDIT-${randomUUID()}`,
            });

            console.log(
              `Auto-applied credit ${amountToApply} to Invoice ${invoiceId}. Remaining Credit: ${tenant.creditBalance - amountToApply}`
            );

            // Notify Tenant of Credit Usage
            await notificationModel.create({
              userId: lease.tenantId,
              message: `A credit of LKR ${amountToApply} was automatically applied to your new rent invoice.`,
              type: 'payment',
              isRead: false,
            });
          }
        }

        // Send Notification (Invoice Created)
        await notificationModel.create({
          userId: lease.tenantId,
          message: `A new rent invoice for ${currentYear}-${currentMonth} has been generated. Due date: ${dueDate.toISOString().split('T')[0]}`,
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
              dueDate: dueDate.toISOString().split('T')[0],
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

    const today = new Date().toISOString().split('T')[0];

    // 1. Find active leases past end date
    const [expiredLeases] = await connection.query(
      `
            SELECT l.lease_id, l.unit_id, p.owner_id 
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            WHERE l.status = 'active' AND l.end_date < ?
        `,
      [today]
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
    const bufferDate = new Date();
    bufferDate.setDate(bufferDate.getDate() - 3);
    const bufferDateStr = bufferDate.toISOString().split('T')[0];

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
  // Warn 30 days before?
  const today = new Date();
  const warningDate = new Date();
  warningDate.setDate(today.getDate() + 30);
  const dateStr = warningDate.toISOString().split('T')[0];

  try {
    // Find leases expiring exactly in 30 days
    // Join units and properties to find the specific owner of the unit
    const [expiringLeases] = await db.query(
      `
            SELECT l.*, t.email as tenant_email, p.owner_id 
            FROM leases l
            JOIN users t ON l.tenant_id = t.user_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN properties p ON un.property_id = p.property_id
            WHERE l.status = 'active'
            AND l.end_date = ?
        `,
      [dateStr]
    );

    if (expiringLeases.length > 0) {
      console.log(
        `Found ${expiringLeases.length} leases expiring on ${dateStr}. Sending warnings...`
      );
      for (const lease of expiringLeases) {
        // 1. Notify Tenant
        await notificationModel.create({
          userId: lease.tenant_id,
          message: `Your lease is expiring in 30 days (on ${lease.end_date}). Please contact us if you wish to renew.`,
          type: 'system',
          severity: 'warning',
        });

        // 2. Notify Owner
        if (lease.owner_id) {
          await notificationModel.create({
            userId: lease.owner_id,
            message: `Lease for Unit ${lease.unit_id} is expiring in 30 days (on ${lease.end_date}).`,
            type: 'system',
            severity: 'warning',
          });
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
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5-day grace period
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
            paymentDate: new Date(),
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
            generatedDate: new Date().toISOString(),
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
            dueDate: new Date().toISOString().split('T')[0],
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
    const today = new Date().toISOString().split('T')[0];

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
      [today, today]
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
      [today, today]
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
};

export default initCronJobs;
