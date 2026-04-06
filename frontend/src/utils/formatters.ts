/**
 * Global currency formatters for LKR.
 * All amounts passed should be in dollars/LKR (NOT cents).
 */

export const formatLKR = (amount: number): string => {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const toLKRFromCents = (cents: number): number => {
  return cents / 100;
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
