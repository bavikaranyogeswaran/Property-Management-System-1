import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const MERCHANT_ID = (process.env.PAYHERE_MERCHANT_ID || '').trim();
const MERCHANT_SECRET = (process.env.PAYHERE_SECRET || '').trim();

/**
 * Generates the hash required for the PayHere checkout form.
 * Formula: md5(merchant_id + order_id + amount + currency + md5(secret).toUpperCase()).toUpperCase()
 */
export const generateCheckoutHash = (orderId, amount, currency = 'LKR') => {
    const amountFormatted = Number(amount).toFixed(2);
    const secretHash = crypto.createHash('md5').update(MERCHANT_SECRET).digest('hex').toUpperCase();
    const hashInput = MERCHANT_ID + orderId + amountFormatted + currency + secretHash;
    return crypto.createHash('md5').update(hashInput).digest('hex').toUpperCase();
};

/**
 * Validates the MD5 signature sent by PayHere in the notification callback.
 * Formula: md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + md5(secret).toUpperCase()).toUpperCase()
 */
export const validateNotificationHash = (payload) => {
    const {
        merchant_id,
        order_id,
        payhere_amount,
        payhere_currency,
        status_code,
        md5sig
    } = payload;

    const secretHash = crypto.createHash('md5').update(MERCHANT_SECRET).digest('hex').toUpperCase();
    const hashInput = merchant_id + order_id + payhere_amount + payhere_currency + status_code + secretHash;
    const calculatedHash = crypto.createHash('md5').update(hashInput).digest('hex').toUpperCase();

    return calculatedHash === md5sig;
};
