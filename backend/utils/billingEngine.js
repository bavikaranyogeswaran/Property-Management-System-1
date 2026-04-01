import { parseLocalDate, formatToLocalDate, getDaysInMonth, getEndOfMonth } from './dateUtils.js';
import { moneyMath } from './moneyUtils.js';

/**
 * BillingEngine Utility
 * Centralizes rent calculation, proration, and due date logic.
 */

const RENT_DUE_DAY = 1; // Standardized: 1st of the month
const DEFAULT_GRACE_PERIOD_DAYS = 5; // Legacy fallback

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

    const FIXED_DAYS_IN_MONTH = 30;

    // Case 2: Proration for Start Month
    if (leaseStart.getFullYear() === year && (leaseStart.getMonth() + 1) === month) {
        if (leaseStart.getDate() > 1) {
            // [LOGIC FIX] Fixed 30-Day billing: treat 31st as 30th to get 1 day of rent.
            const billableDays = FIXED_DAYS_IN_MONTH - Math.min(leaseStart.getDate(), 30) + 1;
            effectiveAmount = moneyMath(monthlyRent).div(FIXED_DAYS_IN_MONTH).mul(billableDays).round().value();
            prorationDetails.push(`${billableDays}/30 days (Starts ${formatToLocalDate(leaseStart)})`);
        }
    }

    // Case 3: Proration for End Month
    if (leaseEnd && leaseEnd.getFullYear() === year && (leaseEnd.getMonth() + 1) === month) {
        if (leaseEnd.getDate() < getDaysInMonth(billingMonthStart)) {
            // [LOGIC FIX] Fixed 30-Day billing: treat 31st as 30th (full month equivalent to 30 days).
            const startDay = (leaseStart > billingMonthStart) ? Math.min(leaseStart.getDate(), 30) : 1;
            const actualBillable = Math.min(leaseEnd.getDate(), 30) - startDay + 1;
            
            effectiveAmount = moneyMath(monthlyRent).div(FIXED_DAYS_IN_MONTH).mul(actualBillable).round().value();
            prorationDetails.push(`${actualBillable}/30 days (Ends ${formatToLocalDate(leaseEnd)})`);
        }
    }

    // effectiveAmount is now a decimal (e.g. 100.50). Fixed 30-day proration applied.

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
    DEFAULT_GRACE_PERIOD_DAYS,
    calculateMonthlyRent
};
