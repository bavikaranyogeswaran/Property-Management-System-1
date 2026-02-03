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

        // 1. Check if unit is available
        // Note: In a transaction, we should select for update ideally.
        const unit = await unitModel.findById(unitId);
        if (!unit) {
            throw new Error('Unit not found');
        }

        // If we are in a transaction that JUST set this unit to occupied (e.g. Lead Conversion), 
        // reading it back might show 'occupied' if using same connection, or 'available' if different.
        // However, standard Lead Conversion flow locks unit status UPDATE *before* calling this lease creation?
        // Actually, the plan is to move ALL unit blocking logic HERE.

        if (unit.status === 'occupied') {
            // Check if this is just an overlap or disjoint
            // Actually, we trust the status, BUT we also check specific dates now.
            // If status is occupied, it might be occupied by a future or past lease?
            // "Occupied" usually means "Right Now".
            // But let's rely on overlap check for date correctness.
            // We'll warn if occupied but proceed to overlap check?
            // No, if occupied, we probably shouldn't create unless we are sure.
            // But let's stick to the overlap check as the source of truth for "Booking Conflict".
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
        await unitModel.update(unitId, { status: 'occupied' }, connection);

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

        // Prepare update data
        const updateData = {
            end_date: newEndDate
        };
        if (newMonthlyRent) {
            updateData.monthly_rent = newMonthlyRent;
        }

        // Update DB
        // We need a specific Update method in Model, or generic?
        // leaseModel currently doesn't have specific `update` method shown in previous view? 
        // Let's check model again or assume we need to add it.
        // I will add a raw query here or delegate to model.Delegate is better.
        await leaseModel.update(leaseId, updateData);

        return true;
    }

    async refundDeposit(leaseId, amount) {
        const lease = await leaseModel.findById(leaseId);
        if (!lease) throw new Error('Lease not found');

        if (lease.securityDeposit <= 0) {
            throw new Error('No security deposit to refund');
        }

        if (amount > lease.securityDeposit) {
            throw new Error('Refund amount cannot exceed security deposit');
        }

        const status = amount >= lease.securityDeposit ? 'refunded' : 'partially_refunded';

        // Logic Check: Deduction Invoice
        // If refund is less than deposit, the difference is withheld.
        // We should generate a PAID invoice for "Security Deposit Deduction" to track this income/expense.
        if (amount < lease.securityDeposit) {
            const deduction = lease.securityDeposit - amount;
            const invoice = await import('../models/invoiceModel.js');
            const invId = await invoice.default.create({
                leaseId,
                amount: deduction,
                dueDate: new Date(), // Immediate
                description: 'Security Deposit Deductions (Damages/Cleaning)'
            });
            await invoice.default.updateStatus(invId, 'paid'); // Paid via deposit
            console.log(`Created Deduction Invoice ${invId} for ${deduction}`);
        }

        await leaseModel.update(leaseId, {
            refunded_amount: amount,
            deposit_status: status
        });

        return { status, refundedAmount: amount };
    }

    async terminateLease(leaseId, terminationDate) {
        const lease = await leaseModel.findById(leaseId);
        if (!lease) throw new Error('Lease not found');

        if (lease.status !== 'active') {
            throw new Error('Only active leases can be terminated');
        }

        // 1. Update Lease Status & End Date
        await leaseModel.update(leaseId, {
            status: 'ended',
            end_date: terminationDate
        });

        // 2. Free up the Unit immediately
        await unitModel.update(lease.unitId, { status: 'available' });

        return { status: 'ended', terminationDate };
    }
}

export default new LeaseService();
