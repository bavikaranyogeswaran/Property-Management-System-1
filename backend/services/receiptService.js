import receiptModel from '../models/receiptModel.js';
import { today } from '../utils/dateUtils.js';
import { randomUUID } from 'crypto';

class ReceiptService {
  /**
   * Generates a receipt for a verified payment.
   *
   * @param {Object} payment
   * @param {Object} invoice
   * @param {Object} [connection]
   */
  async generateReceipt(payment, invoice, connection = null) {
    const paymentId = payment.id || payment.payment_id;
    const invoiceId = invoice.id || invoice.invoice_id;
    const tenantId = invoice.tenantId || invoice.tenant_id;
    const amount = Number(payment.amount);

    // Idempotency: Ensure receipt doesn't already exist for this payment
    const existing = await receiptModel.findByPaymentId(paymentId, connection);
    if (existing) {
      return existing;
    }

    const receiptId = await receiptModel.create(
      {
        paymentId,
        invoiceId,
        tenantId,
        amount,
        generatedDate: today(),
        receiptNumber: `REC-${randomUUID()}`,
      },
      connection
    );

    return await receiptModel.findById(receiptId, connection);
  }
}

export default new ReceiptService();
