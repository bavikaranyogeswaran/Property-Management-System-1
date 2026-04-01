import Decimal from 'decimal.js';

/**
 * Money Utility (Cent-First Architecture)
 * Standardizes on integer cents (LKR 1.00 = 100 cents) for all internal logic.
 */

/**
 * Converts a major unit amount (LKR 100.50) to cents (10050).
 * Use this only for USER INPUT or EXTERNAL API data that is in major units.
 */
export const toCentsFromMajor = (amount) => {
    if (amount === null || amount === undefined) return 0;
    return new Decimal(amount).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
};

/**
 * Legacy alias for toCentsFromMajor. 
 * @deprecated Use toCentsFromMajor for clarity.
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
        add: (val) => moneyMath(d.add(val)),
        sub: (val) => moneyMath(d.sub(val)),
        mul: (val) => moneyMath(d.mul(val)),
        div: (val) => moneyMath(d.div(val)),
        round: () => moneyMath(d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)),
        /** @deprecated Use value() for cents or fromCents() for decimals */
        toCents: () => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
        /** @deprecated Internal logic should stay in cents. Use fromCents(math.value()) for display. */
        toDecimal: () => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
        value: () => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
    };
};

export default {
    toCentsFromMajor,
    toCents,
    fromCents,
    roundToCents,
    moneyMath
};
