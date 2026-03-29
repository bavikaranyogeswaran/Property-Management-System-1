import { parseLocalDate, formatToLocalDate, getDaysInMonth, getEndOfMonth } from './dateUtils.js';
import { moneyMath } from './moneyUtils.js';

/**
 * BillingEngine Utility
 * Centralizes rent calculation, proration, and due date logic.
 */

const RENT_DUE_DAY = 1; // Standardized: 1st of the month
const GRACE_PERIOD_DAYS = 5;

/**
 * Calculates the rent amount and due date for a specific billing month.
 * Handles proration for both the start and end of a lease.
 * 
 * @param {Object} lease - Lease object (must contain startDate, endDate, monthlyRent)
 * @param {number} year 
 * @param {number} month (1-12)
 * @returns {Object} { amount, dueDate, description, month, year }
 */
export const calculateMonthlyRent = (lease, year, month) => {
    const monthlyRent = Number(lease.monthlyRent);
    const leaseStart = parseLocalDate(lease.startDate);
    const leaseEnd = lease.endDate ? parseLocalDate(lease.endDate) : null;
    
    // First day of the billing month (local midnight)
    const billingMonthStart = parseLocalDate(`${year}-${String(month).padStart(2, '0')}-01`);
    // Last day of the billing month
    const billingMonthEnd = getEndOfMonth(billingMonthStart);
    const daysInMonth = getDaysInMonth(billingMonthStart);

    // Standard Due Date (1st of the month)
    const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(RENT_DUE_DAY).padStart(2, '0')}`;

    // Case 1: Lease starts AFTER this billing month or ends BEFORE this billing month
    if (leaseStart > billingMonthEnd || (leaseEnd && leaseEnd < billingMonthStart)) {
        return null; // Not applicable for this month
    }

    let effectiveAmount = monthlyRent;
    let description = `Rent for ${year}-${month}`;
    let prorationDetails = [];

    // Case 2: Proration for Start Month
    if (leaseStart.getFullYear() === year && (leaseStart.getMonth() + 1) === month) {
        if (leaseStart.getDate() > 1) {
            const billableDays = daysInMonth - leaseStart.getDate() + 1;
            effectiveAmount = moneyMath(monthlyRent).div(daysInMonth).mul(billableDays).toCents();
            prorationDetails.push(`${billableDays}/${daysInMonth} days (Starts ${formatToLocalDate(leaseStart)})`);
        }
    }

    // Case 3: Proration for End Month
    if (leaseEnd && leaseEnd.getFullYear() === year && (leaseEnd.getMonth() + 1) === month) {
        if (leaseEnd.getDate() < daysInMonth) {
            const billableDays = leaseEnd.getDate();
            // If already prorated for start (same month start/end), we adjust the base
            const startDay = (leaseStart > billingMonthStart) ? leaseStart.getDate() : 1;
            const actualBillable = leaseEnd.getDate() - startDay + 1;
            
            effectiveAmount = moneyMath(monthlyRent).div(daysInMonth).mul(actualBillable).toCents();
            prorationDetails.push(`${actualBillable}/${daysInMonth} days (Ends ${formatToLocalDate(leaseEnd)})`);
        }
    }

    // effectiveAmount is now an integer (cents). No more rounding hack needed.

    if (prorationDetails.length > 0) {
        description += ` (Prorated: ${prorationDetails.join(', ')})`;
    }

    return {
        amount: effectiveAmount,
        dueDate,
        description,
        month,
        year
    };
};

export default {
    RENT_DUE_DAY,
    GRACE_PERIOD_DAYS,
    calculateMonthlyRent
};
