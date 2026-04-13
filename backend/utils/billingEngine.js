import {
  parseLocalDate,
  formatToLocalDate,
  getDaysInMonth,
  getEndOfMonth,
} from './dateUtils.js';
import { moneyMath, fromCents } from './moneyUtils.js';

/**
 * BillingEngine Utility
 * Centralizes rent calculation, proration, and due date logic.
 */

const RENT_DUE_DAY = 1; // Standardized: 1st of the month
const DEFAULT_GRACE_PERIOD_DAYS = 5; // Legacy fallback

/**
 * Calculates the rent amount and due date for a specific billing month.
 * Handles proration for both the start and end of a lease, AND mid-month rent changes.
 *
 * @param {Object} lease - Lease object (must contain startDate, endDate, monthlyRent)
 * @param {number} year
 * @param {number} month (1-12)
 * @param {Array} adjustments - List of adjustments { effective_date, new_monthly_rent }
 * @returns {Object} { amount, dueDate, description, month, year }
 */
export const calculateMonthlyRent = (lease, year, month, adjustments = []) => {
  let monthlyRent = Number(lease.monthlyRent);
  const leaseStart = parseLocalDate(lease.startDate);
  const leaseEnd = lease.endDate ? parseLocalDate(lease.endDate) : null;

  // First day of the billing month (local midnight)
  const billingMonthStart = parseLocalDate(
    `${year}-${String(month).padStart(2, '0')}-01`
  );
  // Last day of the billing month
  const billingMonthEnd = getEndOfMonth(billingMonthStart);

  const FIXED_DAYS_IN_MONTH = 30;

  // Filter adjustments that fall within THIS billing month and sort by date
  const monthAdjustments = adjustments
    .filter((a) => {
      const ed = parseLocalDate(a.effective_date);
      return ed > billingMonthStart && ed <= billingMonthEnd;
    })
    .sort(
      (a, b) =>
        parseLocalDate(a.effective_date) - parseLocalDate(b.effective_date)
    );

  // Standard Due Date (1st of the month)
  const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(RENT_DUE_DAY).padStart(2, '0')}`;

  // Case 1: Lease starts AFTER this billing month or ends BEFORE this billing month
  if (
    leaseStart > billingMonthEnd ||
    (leaseEnd && leaseEnd < billingMonthStart)
  ) {
    return null; // Not applicable for this month
  }

  let effectiveAmount = 0;
  let description = `Rent for ${year}-${month}`;
  let prorationDetails = [];

  if (monthAdjustments.length === 0) {
    // Standard logic
    effectiveAmount = monthlyRent;

    // Proration for Start Month
    if (
      leaseStart.getFullYear() === year &&
      leaseStart.getMonth() + 1 === month
    ) {
      if (leaseStart.getDate() > 1) {
        const billableDays =
          FIXED_DAYS_IN_MONTH - Math.min(leaseStart.getDate(), 30) + 1;
        effectiveAmount = moneyMath(monthlyRent)
          .div(FIXED_DAYS_IN_MONTH)
          .mul(billableDays)
          .round()
          .value();
        prorationDetails.push(
          `${billableDays}/30 days (Starts ${formatToLocalDate(leaseStart)})`
        );
      }
    }

    // Proration for End Month
    if (
      leaseEnd &&
      leaseEnd.getFullYear() === year &&
      leaseEnd.getMonth() + 1 === month
    ) {
      const endLimit = Math.min(leaseEnd.getDate(), 30);
      const startLimit =
        leaseStart > billingMonthStart ? Math.min(leaseStart.getDate(), 30) : 1;
      const actualBillable = endLimit - startLimit + 1;

      if (actualBillable < 30) {
        effectiveAmount = moneyMath(monthlyRent)
          .div(FIXED_DAYS_IN_MONTH)
          .mul(actualBillable)
          .round()
          .value();
        prorationDetails.push(
          `${actualBillable}/30 days (Ends ${formatToLocalDate(leaseEnd)})`
        );
      }
    }
  } else {
    // [NEW] Composite Billing Logic
    // We split the month into segments based on adjustments.
    let currentStartDay =
      leaseStart > billingMonthStart ? Math.min(leaseStart.getDate(), 30) : 1;
    let currentRate = monthlyRent; // This is the rate at the START of the month

    // Note: We calculate segments up to each adjustment.
    let totalSegmentRent = moneyMath(0);

    for (const adj of monthAdjustments) {
      const adjDate = parseLocalDate(adj.effective_date);
      const segmentEndDay = Math.min(adjDate.getDate() - 1, 30); // Day before adjustment

      if (segmentEndDay >= currentStartDay) {
        const segmentDays = segmentEndDay - currentStartDay + 1;
        const segmentRent = moneyMath(currentRate)
          .div(FIXED_DAYS_IN_MONTH)
          .mul(segmentDays)
          .round()
          .value();
        totalSegmentRent = totalSegmentRent.add(segmentRent);
        prorationDetails.push(`${segmentDays}d@${fromCents(currentRate)}`);
      }

      currentStartDay = Math.min(adjDate.getDate(), 30);
      currentRate = adj.new_monthly_rent;
    }

    // Final segment: from last adjustment to end of month (or lease end)
    const monthEndDay =
      leaseEnd && leaseEnd < billingMonthEnd
        ? Math.min(leaseEnd.getDate(), 30)
        : 30;
    if (monthEndDay >= currentStartDay) {
      const finalDays = monthEndDay - currentStartDay + 1;
      const finalRent = moneyMath(currentRate)
        .div(FIXED_DAYS_IN_MONTH)
        .mul(finalDays)
        .round()
        .value();
      totalSegmentRent = totalSegmentRent.add(finalRent);
      prorationDetails.push(`${finalDays}d@${fromCents(currentRate)}`);
    }

    effectiveAmount = totalSegmentRent.value();
    description += ` (Composite Rate)`;
  }

  if (prorationDetails.length > 0) {
    description += ` [${prorationDetails.join(', ')}]`;
  }

  return {
    amount: effectiveAmount,
    dueDate,
    description,
    month,
    year,
  };
};

export default {
  RENT_DUE_DAY,
  DEFAULT_GRACE_PERIOD_DAYS,
  calculateMonthlyRent,
};
