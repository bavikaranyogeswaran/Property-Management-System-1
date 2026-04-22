import Stripe from 'stripe';
import { config } from '../config/config.js';
import invoiceModel from '../models/invoiceModel.js';
import userModel from '../models/userModel.js';
import paymentService from './paymentService.js';
import { fromCents, toCents } from '../utils/moneyUtils.js';

const stripe = new Stripe(config.stripe.secretKey);

class StripeService {
  /**
   * Creates a Stripe Checkout Session for an invoice.
   * @param {number|null} invoiceId
   * @param {string|null} magicToken
   * @returns {Promise<string>} Checkout URL
   */
  async createCheckoutSession(invoiceId, magicToken = null) {
    // 1. Identify Invoice and confirm eligibility
    let invoice = magicToken
      ? await invoiceModel.findByMagicToken(magicToken)
      : await invoiceModel.findById(invoiceId);

    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status === 'paid') throw new Error('Invoice is already paid');

    // 2. Fetch Tenant Identity
    const tenant = await userModel.findById(
      invoice.tenantId || invoice.tenant_id
    );
    if (!tenant) throw new Error('Tenant record not found');

    const successParams = magicToken ? `?token=${magicToken}` : '';
    const successUrl = `${config.frontendUrl}/payment-success${successParams}`;
    const cancelUrl = `${config.frontendUrl}/payment-cancel`;

    // 3. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'lkr',
            product_data: {
              name:
                invoice.description ||
                `Payment for Invoice #${invoice.id || invoice.invoice_id}`,
              description: `Property Management System - Invoice #${invoice.id || invoice.invoice_id}`,
            },
            unit_amount: invoice.amount, // invoice.amount is already in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: tenant.email,
      client_reference_id: String(invoice.id || invoice.invoice_id),
      metadata: {
        invoiceId: String(invoice.id || invoice.invoice_id),
        magicToken: magicToken || '',
      },
    });

    return session.url;
  }

  /**
   * Processes the official Stripe Webhook event.
   * @param {Buffer} rawBody
   * @param {string} signature
   */
  async handleWebhook(rawBody, signature) {
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        config.stripe.webhookSecret
      );
    } catch (err) {
      console.error(
        `[StripeService] Webhook Signature Verification Failed: ${err.message}`
      );
      throw new Error(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const invoiceId = Number(session.metadata.invoiceId);
      const amountPaid = session.amount_total; // This is in cents
      const paymentIntentId = session.payment_intent;

      console.log(
        `[StripeService] Payment Success for Invoice #${invoiceId}. ID: ${paymentIntentId}`
      );

      // Record automated payment in our system
      await paymentService.recordAutomatedPayment({
        invoiceId,
        amount: amountPaid,
        paymentMethod: 'stripe',
        referenceNumber: paymentIntentId,
        guaranteeFullSettlement: true, // Stripe ensures full payment for the session
      });
    }

    return { received: true };
  }
}

export default new StripeService();
