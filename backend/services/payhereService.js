import { generateCheckoutHash, validateNotificationHash } from '../utils/payhereUtils.js';
import invoiceModel from '../models/invoiceModel.js';
import userModel from '../models/userModel.js';
import paymentService from './paymentService.js';
import { toCents } from '../utils/moneyUtils.js';
import pool from '../config/db.js';
import dotenv from 'dotenv';


dotenv.config();

const MERCHANT_ID = (process.env.PAYHERE_MERCHANT_ID || '').trim();
const NOTIFY_URL = process.env.PAYHERE_NOTIFY_URL || 'http://localhost:5000/api/payhere/notify';
const RETURN_URL = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-success`;
const CANCEL_URL = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-cancel`;

class PayHereService {
    /**
     * Prepares data for the PayHere checkout.
     * @param {number|null} invoiceId 
     * @param {string|null} magicToken
     * @returns {Promise<Object>}
     */
    async prepareCheckout(invoiceId, magicToken = null) {
        let invoice;
        if (magicToken) {
            invoice = await invoiceModel.findByMagicToken(magicToken);
        } else {
            invoice = await invoiceModel.findById(invoiceId);
        }
        if (!invoice) throw new Error('Invoice not found');
        if (invoice.status === 'paid') throw new Error('Invoice is already paid');

        const tenant = await userModel.findById(invoice.tenantId || invoice.tenant_id);
        if (!tenant) throw new Error('Tenant record not found');

        const orderId = `INV-${invoice.id || invoice.invoice_id}-${Date.now()}`;
        // [FIXED] Database stores Decimal (Major units). PayHere Sandbox/Production also expects Major units.
        const amount = fromCents(invoice.amount); 
        const currency = 'LKR';

        const hash = generateCheckoutHash(orderId, amount, currency);

        // Save the orderId to the invoice so the success page can find it later
        await invoiceModel.updateLastOrderId(invoice.id || invoice.invoice_id, orderId);

        return {
            sandbox: true, // Initially using sandbox
            merchant_id: MERCHANT_ID,
            return_url: `${RETURN_URL}?token=${magicToken}`,
            cancel_url: CANCEL_URL,
            notify_url: NOTIFY_URL,
            order_id: orderId,
            items: invoice.description || `Payment for Invoice #${invoiceId}`,
            amount: amount.toFixed(2),
            currency: currency,
            hash: hash,
            first_name: tenant.firstName || tenant.first_name || 'Tenant',
            last_name: tenant.lastName || tenant.last_name || `#${tenant.id}`,
            email: tenant.email,
            phone: tenant.phone || '',
            address: 'Colombo, Sri Lanka', // Placeholder as required by PayHere
            city: 'Colombo',
            country: 'Sri Lanka',
            custom_1: magicToken
        };
    }

    /**
     * Processes the notification sent by PayHere.
     * @param {Object} payload 
     */
    async processNotification(payload) {
        console.log('[PayHereService] Received Notification:', payload);

        // 1. Validate Hash
        const isValid = validateNotificationHash(payload);
        if (!isValid) {
            console.error('[PayHereService] Invalid Hash Signature Received');
            throw new Error('Invalid signature');
        }

        const { order_id, status_code, payhere_amount, payment_id } = payload;
        
        // Extract invoice ID (Format: INV-ID-TIMESTAMP)
        const parts = order_id.split('-');
        let invoiceId;
        
        if (parts.length >= 2) {
            invoiceId = Number(parts[1]);
        } else {
            invoiceId = Number(order_id);
        }

        if (isNaN(invoiceId)) {
            console.error(`[PayHereService] Failed to extract valid Invoice ID from Order ID: ${order_id}`);
            throw new Error(`Invalid Order ID format: ${order_id}`);
        }

        // 2. Handle Status Code
        // 2 = Success, 0 = Pending, -1 = Cancelled, -2 = Failed, -3 = Chargedback
        if (status_code === '2') {
            console.log(`[PayHereService] Payment Successful for Invoice #${invoiceId}`);

            // 3. Record the payment in our system
            // [HARDENED] Ensure the recorded amount is converted to integer cents for the ledger.
            const paidCents = toCents(payhere_amount);

            await paymentService.recordAutomatedPayment({
                invoiceId: invoiceId,
                amount: paidCents,
                paymentMethod: 'payhere',
                referenceNumber: payment_id
            });


            return { success: true, message: 'Payment recorded' };
        } else {
            console.warn(`[PayHereService] Payment status for Invoice #${invoiceId} is ${status_code}`);
            return { success: false, message: `Payment status: ${status_code}` };
        }
    }
}

export default new PayHereService();
