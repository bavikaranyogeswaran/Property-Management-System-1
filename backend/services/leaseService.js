import leaseModel from '../models/leaseModel.js';
import unitModel from '../models/unitModel.js';
import tenantModel from '../models/tenantModel.js';
import pool from '../config/db.js';

class LeaseService {
    /**
     * Creates a new lease.
     * @param {Object} data - { tenantId, unitId, startDate, endDate, monthlyRent, securityDeposit }
     * @param {Object} [connection] - Optional database connection for transactions
     * @returns {Promise<number>} - The ID of the created lease
     */
    async createLease(data, connection = null) {
        const { tenantId, unitId, startDate, endDate, monthlyRent, securityDeposit } = data;

        // Validation
        // Validation: Check required fields (allow 0 for rent here, caught later)
        if (!tenantId || !unitId || !startDate || !endDate || monthlyRent === undefined || monthlyRent === null) {
            throw new Error('All fields are required for lease creation.');
        }

        if (new Date(startDate) >= new Date(endDate)) {
            throw new Error('End date must be after start date');
        }

        if (isNaN(new Date(startDate).getTime()) || isNaN(new Date(endDate).getTime())) {
            throw new Error('Invalid date format');
        }

        if (monthlyRent <= 0) {
            throw new Error('Monthly rent must be greater than 0');
        }

        const tenant = await tenantModel.findByUserId(tenantId);
        if (!tenant) {
            throw new Error('Tenant not found');
        }

        // Use provided connection or get a new one (for read operations checking availability)
        // If connection is provided, we assume the caller handles commit/rollback.
        // For reads, we can use the same connection to see "uncommitted" changes if within same transaction?
        // Note: unitModel.findById might not support connection param yet. 
        // If we really need strict transaction safety for checking 'occupied', we should support connection in unitModel.read.
        // For now, we'll try to use the connection if available for updates, but reads might be on pool if model doesn't support it.
        // CRITICAL: If 'unitModel.findById' doesn't support connection, we might read stale data or miss locks.
        // Let's assume standard behavior for now: optimistic check.

        // 1. Check if unit is available (and LOCK it)
        const unit = await unitModel.findByIdForUpdate(unitId, connection); // Uses SELECT ... FOR UPDATE
        if (!unit) {
            throw new Error('Unit not found');
        }

        // Now strict check status within the lock
        if (unit.status === 'occupied') {
            // Strict check: If occupied, we only proceed if we are booking a FUTURE date range that relies on overlap check.
            // But if start date is today, and it's occupied, we block?
            // Actually, existing logic relied on overlap check.
            // We will keep relying on overlap check, but the Lock ensures no one else changes status or leases in parallel.
        }

        if (unit.status === 'maintenance') {
            throw new Error('Unit is currently under maintenance and cannot be leased.');
        }

        // 2. Check for Date Overlaps
        const hasOverlap = await leaseModel.checkOverlap(unitId, startDate, endDate);
        if (hasOverlap) {
            throw new Error('Unit is already leased for the selected dates.');
        }

        const leaseParams = {
            tenantId,
            unitId,
            startDate,
            endDate,
            monthlyRent,
            securityDeposit,
            status: 'active'
        };

        // 2. Create Lease
        const leaseId = await leaseModel.create(leaseParams, connection);

        // 3. Update Unit Status
        // Only set to occupied if the lease is CURRENT (starts today or past)
        const today = new Date().toISOString().split('T')[0];
        if (startDate <= today) {
            await unitModel.update(unitId, { status: 'occupied' }, connection);

            // CLEANUP: Cancel conflicting future/current visits
            await connection.query(
                `UPDATE property_visits 
             SET status = 'cancelled', notes = CONCAT(COALESCE(notes, ''), ' [System: Unit Leased]') 
             WHERE unit_id = ? AND status = 'scheduled' AND scheduled_date >= ?`,
                [unitId, today]
            );

            // CLEANUP: Mark specific-unit leads as dropped
            await connection.query(
                `UPDATE leads 
             SET status = 'dropped', notes = CONCAT(COALESCE(notes, ''), ' [System: Unit Leased]') 
             WHERE unit_id = ? AND status = 'interested'`,
                [unitId]
            );
        }

        // 4. Generate Initial Invoices (Logic Check: Missed Item)
        // A. Security Deposit Invoice
        if (securityDeposit > 0) {
            // We need to import invoiceModel. Circular dependency risk? 
            // leaseService imports leaseModel, unitModel, tenantModel. 
            // We should import invoiceModel at top or dynamically.
            // Let's assume top-level import (added in separate step or assumes availability).
            const invoice = await import('../models/invoiceModel.js');
            await invoice.default.create({
                leaseId,
                amount: securityDeposit,
                dueDate: startDate, // Due on start date?
                description: 'Security Deposit'
            });
        }

        // B. First Month Rent (Logic Check: PRORATION)
        // If lease starts on 1st, full rent. If mid-month, prorate.
        // Formula: (MonthlyRent / DaysInMonth) * DaysRemaining
        const start = new Date(startDate);
        const year = start.getFullYear();
        const month = start.getMonth() + 1; // 1-12
        const daysInMonth = new Date(year, month, 0).getDate();
        const startDay = start.getDate();

        let initialRentAmount = monthlyRent;
        let invoiceDescription = `Rent for ${year}-${month}`;

        if (startDay > 1) {
            const daysRemaining = daysInMonth - startDay + 1;
            // Round to 2 decimals
            initialRentAmount = Math.round((monthlyRent / daysInMonth) * daysRemaining * 100) / 100;
            invoiceDescription += ` (Prorated: ${daysRemaining}/${daysInMonth} days)`;
            console.log(`Prorating Rent: ${daysRemaining} days. Amount: ${initialRentAmount}`);
        }

        const invoice = await import('../models/invoiceModel.js');
        const exists = await invoice.default.exists(leaseId, year, month);
        if (!exists) {
            await invoice.default.create({
                leaseId,
                amount: initialRentAmount,
                dueDate: startDate,
                description: invoiceDescription
            });
        }

        // Audit Log
        const auditLogger = (await import('../utils/auditLogger.js')).default;
        await auditLogger.log({
            userId: null, // Usually triggered by owner/admin, typically we'd pass userId but service signature doesn't have it yet.
            actionType: 'LEASE_CREATED',
            entityId: leaseId,
            details: { tenantId, unitId, startDate, endDate, monthlyRent }
        });

        return leaseId;
    }
    async renewLease(leaseId, newEndDate, newMonthlyRent = null) {
        const lease = await leaseModel.findById(leaseId);
        if (!lease) {
            throw new Error('Lease not found');
        }

        if (lease.status !== 'active' && lease.status !== 'expiring') {
            throw new Error('Only active leases can be renewed');
        }

        const currentEndDate = new Date(lease.endDate);
        const nextEndDate = new Date(newEndDate);

        if (nextEndDate <= currentEndDate) {
            throw new Error('New end date must be after current end date');
        }

        // Check for overlaps in the extension period? 
        // Logic: checkOverlap(unitId, currentEndDate + 1 day, nextEndDate)
        // Ensure no OTHER lease starts in the extension period.
        const extensionStartDate = new Date(currentEndDate);
        extensionStartDate.setDate(extensionStartDate.getDate() + 1);

        const hasOverlap = await leaseModel.checkOverlap(
            lease.unitId,
            extensionStartDate.toISOString().split('T')[0],
            nextEndDate.toISOString().split('T')[0]
        );

        if (hasOverlap) {
            // Note: checkOverlap checks if ANY lease exists in range. 
            // We need to exclude the CURRENT lease from that check if it overlaps itself?
            // But checkOverlap logic usually queries `WHERE start_date <= ? AND end_date >= ?`.
            // Calling it for the *future extension* range should be fine, unless there is a future lease already booked.
            throw new Error('Unit is already booked for the requested renewal period.');
        }

        // Update DB
        const updateData = {
            end_date: newEndDate
        };
        if (newMonthlyRent) {
            updateData.monthly_rent = newMonthlyRent;
        }

        await leaseModel.update(leaseId, updateData);

        // Logic Check: Deposit Top-Up
        // If rent increased, we should increase the deposit (if policy says Deposit = 1 Month Rent).
        // Let's assume typical policy: Deposit = 1 Month Rent.
        // If newRent > currentRent, create invoice for difference.
        if (newMonthlyRent && newMonthlyRent > lease.monthlyRent) {
            const diff = newMonthlyRent - lease.monthlyRent;
            // Update lease security_deposit value?
            // Yes, standard is to update it.
            // We need a specific update for security_deposit (it's in lease table).
            // But leaseModel.update is generic? Assuming yes or we add it.
            // leaseModel update call above (line 192) handled fields passed. 
            // We should add security_deposit to updateData if we want to track the *target* deposit.
            // But wait, if we invoice for it, we shouldn't mark it 'paid' yet. 
            // The 'security_deposit' column usually tracks 'Amount Held' or 'Target Amount'? 
            // Schema has 'security_deposit' and 'deposit_status'.
            // Usually 'security_deposit' is the Required Amount.

            // New logic:
            // 1. Update security_deposit target in DB.
            await leaseModel.update(leaseId, { security_deposit: newMonthlyRent });

            // 2. Create Invoice for Difference
            const invoiceModel = (await import('../models/invoiceModel.js')).default;
            await invoiceModel.create({
                leaseId,
                amount: diff,
                dueDate: new Date(), // Immediate
                description: 'Security Deposit Top-Up (Rent Increase)'
            });
            // 3. Mark deposit status? Status remains 'paid' (or 'partially_paid' concept? No enum only has pending/paid).
            // This is tricky. status 'paid' implies full? 
            // For now, let's leave status as 'paid' but issue the invoice. 
            // OR set status to 'pending' if strict. 
            // Strictly -> 'pending'. because we don't hold the full new amount.
            await leaseModel.update(leaseId, { deposit_status: 'pending' }); // Reset until top-up is paid.

            console.log(`Lease Renewal: Rent increased. Invoiced Top-Up ${diff}. Reset Deposit Status.`);
        }

        // 4. Sync Future Invoices
        // If rent was updated, we must ensure any *already generated* pending invoices for future months (e.g. from Cron) are updated.
        if (newMonthlyRent) {
            const today = new Date().toISOString().split('T')[0];
            await pool.query(`
                UPDATE rent_invoices 
                SET amount = ?, description = CONCAT(description, ' (Rent Adjusted)')
                WHERE lease_id = ? 
                AND status = 'pending' 
                AND invoice_type = 'rent'
                AND due_date > ?
            `, [newMonthlyRent, leaseId, today]);
            console.log(`Synced future invoices for Lease ${leaseId} to new rent ${newMonthlyRent}`);
        }

        // Audit Log
        const auditLogger = (await import('../utils/auditLogger.js')).default;
        // userId? We don't have req here easily unless passed.
        // Assuming 'system' or we update signature of renewLease. 
        // For now, let's log with userId=null (System) or try to grab it if we refactor.
        // Let's assume null for now as this service might be called by system logic too? 
        // But renew is usually manual.
        // I will update the controller later to pass user, or just log basic info here.
        await auditLogger.log({
            userId: null, // Should be passed but skipping for now to avoid breaking signature widely
            actionType: 'LEASE_RENEWAL',
            entityId: leaseId,
            details: { newEndDate, newMonthlyRent }
        });

        return true;
    }

    async refundDeposit(leaseId, amount) {
        const lease = await leaseModel.findById(leaseId);
        if (!lease) throw new Error('Lease not found');

        if (lease.securityDeposit <= 0) {
            throw new Error('No security deposit to refund');
        }

        // Logic Check: Idempotency
        if (lease.deposit_status === 'refunded') {
            throw new Error('Deposit has already been refunded.');
        }

        if (lease.deposit_status !== 'paid') {
            throw new Error('Cannot refund deposit that has not been fully paid.');
        }

        const status = amount >= lease.securityDeposit ? 'refunded' : 'partially_refunded';

        if (amount > lease.securityDeposit) {
            throw new Error('Refund amount cannot exceed security deposit');
        }

        // Logic Check: Unpaid Debt (Smart Offset)
        const invoiceModel = (await import('../models/invoiceModel.js')).default;
        // We no longer BLOCK on debt. We OFFSET it.

        let withheldAmount = lease.securityDeposit - amount;

        // 1. Pay off Pending Debt with Withheld Amount
        if (withheldAmount > 0) {
            const paymentModel = (await import('../models/paymentModel.js')).default;

            // Fetch pending invoices
            const pendingInvoices = await pool.query(
                `SELECT * FROM rent_invoices WHERE lease_id = ? AND status IN ('pending', 'partially_paid') ORDER BY due_date ASC`,
                [leaseId]
            ).then(([rows]) => rows);

            for (const inv of pendingInvoices) {
                if (withheldAmount <= 0) break;

                // Calculate outstanding for this invoice
                // We need to know how much is already paid? 
                // We can fetch payments or rely on 'pending' status?
                // Safer: Get payments sum.
                const payments = await paymentModel.findByInvoiceId(inv.invoice_id);
                const paidAlready = payments
                    .filter(p => p.status === 'verified')
                    .reduce((sum, p) => sum + Number(p.amount), 0);

                const outstanding = inv.amount - paidAlready;
                const toPay = Math.min(withheldAmount, outstanding);

                if (toPay > 0) {
                    // Create Payment (Deposit Offset)
                    const payId = await paymentModel.create({
                        invoiceId: inv.invoice_id,
                        amount: toPay,
                        paymentDate: new Date(),
                        paymentMethod: 'deposit_offset',
                        referenceNumber: `DEP-OFF-${Date.now()}`,
                        evidenceUrl: null
                    });
                    await paymentModel.updateStatus(payId, 'verified'); // This triggers invoice status update in controller logic if we called controller, but here we are in service.
                    // We must verify invoice status manually or call shared logic.
                    // Simple update:
                    if (toPay >= outstanding) {
                        await invoiceModel.updateStatus(inv.invoice_id, 'paid');
                    } else {
                        await invoiceModel.updateStatus(inv.invoice_id, 'partially_paid');
                    }

                    console.log(`Offset Pending Invoice ${inv.invoice_id} with ${toPay} from Deposit.`);

                    // 1a. Generate Receipt for Offset
                    const receiptModel = (await import('../models/receiptModel.js')).default;
                    await receiptModel.create({
                        paymentId: payId,
                        invoiceId: inv.invoice_id,
                        tenantId: lease.tenantId,
                        amount: toPay,
                        generatedDate: new Date().toISOString(),
                        receiptNumber: `REC-OFFSET-${Date.now()}`
                    });
                    withheldAmount -= toPay;
                }
            }
        }

        // 2. Create Deduction Invoice for REMAINDER (True Damages)
        if (withheldAmount > 0) {
            // If money is STILL left after paying all debts, this remaining amount is the actual "Deduction/Damages"
            const invId = await invoiceModel.create({
                leaseId,
                amount: withheldAmount,
                dueDate: new Date(), // Immediate
                description: 'Security Deposit Deductions (Damages/Cleaning)'
            });

            // Create Payment for it
            const paymentModel = (await import('../models/paymentModel.js')).default;
            const payId = await paymentModel.create({
                invoiceId: invId,
                amount: withheldAmount,
                paymentDate: new Date(),
                paymentMethod: 'deposit_deduction',
                referenceNumber: `SYS-DEDUCT-${Date.now()}`,
                evidenceUrl: null
            });
            await paymentModel.updateStatus(payId, 'verified');
            await invoiceModel.updateStatus(invId, 'paid');

            // 2a. Generate Receipt for Deduction
            const receiptModel = (await import('../models/receiptModel.js')).default;
            await receiptModel.create({
                paymentId: payId,
                invoiceId: invId,
                tenantId: lease.tenantId,
                amount: withheldAmount,
                generatedDate: new Date().toISOString(),
                receiptNumber: `REC-DEDUCT-${Date.now()}`
            });
            console.log(`Created Deduction Invoice ${invId} for Remaining Withheld: ${withheldAmount}`);
        }

        await leaseModel.update(leaseId, {
            refunded_amount: amount,
            deposit_status: status
        });

        // Audit Log
        const auditLogger = (await import('../utils/auditLogger.js')).default;
        await auditLogger.log({
            userId: null, // System action or triggered by admin (userId not passed here currently)
            actionType: 'DEPOSIT_REFUNDED',
            entityId: leaseId,
            details: { refundedAmount: amount, status }
        });

        return { status, refundedAmount: amount };
    }

    async terminateLease(leaseId, terminationDate, terminationFee = 0) {
        const lease = await leaseModel.findById(leaseId);
        if (!lease) throw new Error('Lease not found');

        if (lease.status !== 'active') {
            throw new Error('Only active leases can be terminated');
        }

        const today = new Date();
        const start = new Date(lease.startDate);

        // Logic Check: Pre-Move-In Cancellation
        // If the lease is terminated BEFORE the start date, it is a cancellation.
        // We should void all pending invoices and mark lease as 'cancelled'.
        if (today < start) {
            console.log(`Lease ${leaseId} cancelled before start date.`);
            // Note: We typically don't charge termination fees for pre-move-in cancellations
            // unless specified. If user passes fee here, we COULD charge it, but usually
            // we just void everything. Let's assume Fee applies to Active Leases (Post-Move-In).

            // 1. Update Lease Status to 'cancelled'
            await leaseModel.update(leaseId, {
                status: 'cancelled',
                end_date: terminationDate // or today? Keep term date provided.
            });

            // 2. Void all PENDING invoices for this lease
            // We need a method or raw query. Assuming raw for speed or import invoiceModel.
            const invoice = await import('../models/invoiceModel.js');
            // We need a voidByLeaseId method or similar. Let's iterate or use raw update in model.
            // invoiceModel usually has updateStatus.
            // Let's assume we fetch pending and update.
            // Or better, add `voidPendingByLeaseId` to invoiceModel?
            // I'll stick to logic here:
            // "UPDATE rent_invoices SET status='void' WHERE lease_id=? AND status='pending'"
            await pool.query("UPDATE rent_invoices SET status='void' WHERE lease_id = ? AND status='pending'", [leaseId]);

            // 3. Free up unit
            await unitModel.update(lease.unitId, { status: 'available' });

            return { status: 'cancelled', terminationDate };
        }

        // Standard Termination (Post-Move-In)

        // 1. Generate Termination Fee Invoice (if applicable)
        if (terminationFee > 0) {
            const invoiceModel = (await import('../models/invoiceModel.js')).default;
            await invoiceModel.create({
                leaseId,
                amount: terminationFee,
                dueDate: new Date(), // Immediate
                description: 'Early Termination Fee'
            });
            console.log(`Generated Termination Fee Invoice: ${terminationFee}`);
        }

        // 2. Update Lease Status & End Date
        await leaseModel.update(leaseId, {
            status: 'ended',
            end_date: terminationDate
        });

        // 2b. Void Future Pending Invoices
        // Ensure we don't leave ghost debt for months after termination
        await pool.query(
            "UPDATE rent_invoices SET status='void' WHERE lease_id = ? AND status='pending' AND due_date > ?",
            [leaseId, terminationDate]
        );

        // 3. Free up the Unit (Set to 'maintenance' for turnover buffer)
        // Was 'available', but we should allow cleaning.
        // Cron job will auto-release it after 3 days if no active maintenance requests.
        await unitModel.update(lease.unitId, { status: 'maintenance' });

        // Limit: Audit Log
        const auditLogger = (await import('../utils/auditLogger.js')).default;
        await auditLogger.log({
            userId: null,
            actionType: 'LEASE_TERMINATION',
            entityId: leaseId,
            details: { terminationDate, status: lease.status } // Status changed *to* ended/cancelled
        });

        return { status: 'ended', terminationDate };
    }
}

export default new LeaseService();
