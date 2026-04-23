// ============================================================================
//  CURRENCY FORMATTERS (The Accountant)
// ============================================================================
//  This utility ensures that every price shown in the UI is formatted
//  consistently for the Sri Lankan Rupee (LKR).
//  It also handles the critical conversion between Backend Cents and Frontend Major units.
// ============================================================================

/**
 * [GUIDELINE] LKR Display Pattern
 * 1. Conversion: Use toLKRFromCents(val) for ALL data coming from Backend.
 * 2. Display: Use formatLKR(toLKRFromCents(val)) for currency strings.
 * 3. Submission: Use toCentsFromLKR(val) before sending back to API.
 */

export const formatLKR = (amount: number): string => {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Converts backend cent values (integers) to LKR (major units).
 * Always use this when rendering financial data from the API.
 */
export const toLKRFromCents = (cents: number | string | any): number => {
  if (cents === null || cents === undefined || cents === '') return 0;
  const val = typeof cents === 'string' ? parseFloat(cents) : cents;
  if (isNaN(val)) return 0;
  return val / 100;
};

export const toCentsFromLKR = (lkr: number): number => {
  return Math.round(lkr * 100);
};

export const formatToLocalDate = (dateString: string): string => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};
