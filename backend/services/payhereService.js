import {
  generateCheckoutHash,
  validateNotificationHash,
} from '../utils/payhereUtils.js';
import invoiceModel from '../models/invoiceModel.js';
import userModel from '../models/userModel.js';
import paymentService from './paymentService.js';
import { toCents, fromCents } from '../utils/moneyUtils.js';
import pool from '../config/db.js';
import dotenv from 'dotenv';
import paymentModel from '../models/paymentModel.js';

dotenv.config();

const MERCHANT_ID = (process.env.PAYHERE_MERCHANT_ID || '').trim();
const NOTIFY_URL =
  process.env.PAYHERE_NOTIFY_URL || 'http://localhost:5000/api/payhere/notify';
const RETURN_URL = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-success`;
const CANCEL_URL = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-cancel`;

class PayHereService {
  /**
   * Prepares data for the PayHere checkout.
   * @param {number|null} invoiceId
   * @param {string|null} magicToken
   * @returns {Promise<Object>}
   */
  // PREPARE CHECKOUT: Generates the cryptographically signed payload for the PayHere gateway.
  async prepareCheckout(invoiceId, magicToken = null) {
    // 1. [SECURITY] Identify Invoice and confirm eligibility (Unpaid & No pending manual verify)
    let invoice = magicToken
      ? await invoiceModel.findByMagicToken(magicToken)
      : await invoiceModel.findById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status === 'paid') throw new Error('Invoice is already paid');

    const existingPayments = await paymentModel.findByInvoiceId(
      invoice.id || invoice.invoice_id
    );
    if (existingPayments.some((p) => p.status === 'pending'))
      throw new Error('Payment already awaiting verification.');

    // 2. Fetch Tenant Identity for PII requirements (First/Last name, Email)
    const tenant = await userModel.findById(
      invoice.tenantId || invoice.tenant_id
    );
    if (!tenant) throw new Error('Tenant record not found');

    // 3. Generate unique Order Reference and sign with Merchant Secret
    const orderId = `INV-${invoice.id || invoice.invoice_id}-${Date.now()}`;
    const amount = fromCents(invoice.amount);
    const hash = generateCheckoutHash(orderId, amount, 'LKR');

    // 4. [AUDIT] Track original Order ID against Invoice for callback mapping
    await invoiceModel.updateLastOrderId(
      invoice.id || invoice.invoice_id,
      orderId
    );

    // 5. Build structured payload for the frontend POST-to-gateway
    return {
      sandbox:
        process.env.NODE_ENV !== 'production' ||
        process.env.PAYHERE_SANDBOX === 'true',
      merchant_id: MERCHANT_ID,
      return_url: `${RETURN_URL}?token=${magicToken}`,
      cancel_url: CANCEL_URL,
      notify_url: NOTIFY_URL,
      order_id: orderId,
      items: invoice.description || `Payment for Invoice #${invoiceId}`,
      amount: amount.toFixed(2),
      currency: 'LKR',
      hash,
      first_name: tenant.firstName || tenant.first_name || 'Tenant',
      last_name: tenant.lastName || tenant.last_name || `#${tenant.id}`,
      email: tenant.email,
      phone: tenant.phone || '',
      address: 'Colombo, Sri Lanka',
      city: 'Colombo',
      country: 'Sri Lanka',
      custom_1: magicToken,
    };
  }

  /**
   * Processes the notification sent by PayHere.
   * @param {Object} payload
   */
  // PROCESS NOTIFICATION: Webhook receiver for the async "Payment Done" event.
  async processNotification(payload, skipHash = false) {
    // 1. [SECURITY] Cryptographic Signature Check: Ensure message originates from PayHere
    if (!skipHash && !validateNotificationHash(payload))
      throw new Error('Invalid signature');

    const { order_id, status_code, payhere_amount, payment_id } = payload;

    // 2. Map Order Reference back to DB Invoice record
    const parts = order_id.split('-');
    const invoiceId = parts.length >= 2 ? Number(parts[1]) : Number(order_id);
    if (isNaN(invoiceId)) throw new Error(`Invalid Order ID: ${order_id}`);

    // 2 = Success Code
    if (status_code === '2') {
      // 3. [FINANCIAL] Amount Guard: Verify that recieved amount matches expected invoice amount
      const invoice = await invoiceModel.findById(invoiceId);
      if (!invoice) throw new Error('Invoice not found');

      if (Math.abs(Number(invoice.amount) - toCents(payhere_amount)) > 100)
        throw new Error('Amount mismatch.');

      // 4. Record Automated Receipt: Hand over to PaymentService for DB finalization and receipt generation
      const { paymentId, setupToken } =
        await paymentService.recordAutomatedPayment({
          invoiceId,
          amount: toCents(payhere_amount),
          paymentMethod: 'payhere',
          referenceNumber: payment_id,
          guaranteeFullSettlement: false,
        });

      return {
        success: true,
        message: 'Payment recorded',
        paymentId,
        setupToken,
      };
    }

    return { success: false, message: `Status: ${status_code}` };
  }
}

export default new PayHereService();
