import Decimal from 'decimal.js';

/**
 * Money Utility (Cent-First Architecture)
 * Standardizes on integer cents (LKR 1.00 = 100 cents) for all internal logic.
 */

/**
 * [GUIDELINE] Standard LKR Money Formatting
 * 1. Internal Logic: ALWAYS stay in cents (integers). Use toCentsFromMajor(input) immediately.
 * 2. Math Operations: Use moneyMath() for any arithmetic to avoid float errors.
 * 3. Database: Storage column must be BIGINT or DECIMAL(19,0) representing cents.
 * 4. Display: Use fromCents(val).toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })
 */

/**
 * Converts a major unit amount (LKR 100.50) to cents (10050).
 * Use this only for USER INPUT or EXTERNAL API data that is in major units.
 */
export const toCentsFromMajor = (amount) => {
  if (amount === null || amount === undefined) return 0;
  return new Decimal(amount)
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
};

/**
 * ALIAS for toCentsFromMajor. Use this for clarity when converting user-facing LKR inputs.
 */
export const lkrToCents = toCentsFromMajor;

/**
 * Legacy alias for toCentsFromMajor.
 * @deprecated Use toCentsFromMajor or lkrToCents for clarity.
 */
export const toCents = toCentsFromMajor;

/**
 * Converts cents back to a float (major units) for display or external gateways.
 * 10050 -> 100.50
 */
export const fromCents = (cents) => {
  if (cents === null || cents === undefined) return 0.0;
  return new Decimal(cents).div(100).toNumber();
};

/**
 * Rounds a value that is already in the cent scale (e.g. from division/multiplication).
 * 150000.0000001 -> 150000
 */
export const roundToCents = (val) => {
  return new Decimal(val).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
};

/**
 * Perform precise currency math on cent values.
 * Usage: moneyMath(50000).mul(1.03).round().value()
 */
export const moneyMath = (amountInCents) => {
  const d = new Decimal(amountInCents);
  return {
    add: (val) =>
      moneyMath(d.add(val).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)),
    sub: (val) =>
      moneyMath(d.sub(val).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)),
    mul: (val) => moneyMath(d.mul(val)),
    div: (val) => moneyMath(d.div(val)),
    round: () => moneyMath(d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)),
    /** @deprecated Use value() for cents or fromCents() for decimals */
    toCents: () => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
    /** @deprecated Internal logic should stay in cents. Use fromCents(math.value()) for display. */
    toDecimal: () => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
    value: () => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
  };
};

export default {
  toCentsFromMajor,
  lkrToCents,
  toCents,
  fromCents,
  roundToCents,
  moneyMath,
};
