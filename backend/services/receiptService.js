// ============================================================================
//  RECEIPT SERVICE (The Proof of Payment Maker)
// ============================================================================
//  This service generates official digital receipts.
//  It creates unique receipt numbers and ensures every verified payment
//  has a corresponding legal proof for the tenant.
// ============================================================================

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
  // GENERATE RECEIPT: Creates a permanent physical-legal proof record for a successful payment.
  async generateReceipt(payment, invoice, connection = null) {
    const paymentId = payment.id || payment.payment_id;
    const invoiceId = invoice.id || invoice.invoice_id;
    const tenantId = invoice.tenantId || invoice.tenant_id;
    const amount = Number(payment.amount);

    // 1. [FINANCIAL] Idempotency: Prevent double-issuing receipts for the same transaction
    const existing = await receiptModel.findByPaymentId(paymentId, connection);
    if (existing) return existing;

    // 2. Generate unique tracking number and persist record
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

    // 3. Resolve hydrated receipt for return
    return await receiptModel.findById(receiptId, connection);
  }
}

export default new ReceiptService();
