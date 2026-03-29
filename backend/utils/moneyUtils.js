import Decimal from 'decimal.js';

/**
 * Money Utility
 * Converts currency amounts between float (LKR 100.50) and integer (10050 cents).
 * Standardizes on 2 decimal places for subunits.
 */

/**
 * Converts a dollar/rupee amount to cents.
 * Handles strings or numbers. 100.50 -> 10050
 */
export const toCents = (amount) => {
    if (amount === null || amount === undefined) return 0;
    // We use Decimal to avoid (100.51 * 100) = 10050.9999999
    return new Decimal(amount).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
};

/**
 * Converts cents back to a float for display/legacy use.
 * 10050 -> 100.50
 */
export const fromCents = (cents) => {
    if (cents === null || cents === undefined) return 0.0;
    return new Decimal(cents).div(100).toNumber();
};

/**
 * Perform precise currency math.
 * Usage: moneyMath(100.51).add(20.10).toCents()
 */
export const moneyMath = (amount) => {
    const d = new Decimal(amount);
    return {
        add: (val) => moneyMath(d.add(val)),
        sub: (val) => moneyMath(d.sub(val)),
        mul: (val) => moneyMath(d.mul(val)),
        div: (val) => moneyMath(d.div(val)),
        round: () => moneyMath(d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)),
        toCents: () => d.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
        toDecimal: () => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
        value: () => d.toNumber()
    };
};

export default {
    toCents,
    fromCents,
    moneyMath
};
