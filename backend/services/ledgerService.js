// ============================================================================
//  LEDGER SERVICE (The Auditor)
// ============================================================================
//  This service ensures that every dollar in the system is accounted for.
//  It maps business events (like rent payments) into formalized double-entry
//  accounting records for financial integrity.
// ============================================================================

import ledgerModel from '../models/ledgerModel.js';
import { getCurrentDateString } from '../utils/dateUtils.js';

/**
 * Maps an invoice_type to the correct accounting ledger classification.
 */
export function getLedgerClassification(invoiceType) {
  switch (invoiceType) {
    case 'deposit':
      return { accountType: 'liability', category: 'deposit_held' };
    case 'rent':
      return { accountType: 'revenue', category: 'rent' };
    case 'late_fee':
      return { accountType: 'revenue', category: 'late_fee' };
    case 'maintenance':
      return { accountType: 'revenue', category: 'maintenance' };
    default:
      return { accountType: 'revenue', category: 'other' };
  }
}

class LedgerService {
  /**
   * Posts a payment entry to the centralized accounting ledger.
   * Handles classification and mapping to the accounting_ledger table.
   *
   * @param {number|string} paymentId
   * @param {Object} invoice
   * @param {number} amount
   * @param {string} [description]
   * @param {Object} [connection]
   */
  // POST PAYMENT: Staff/System step. Records a verified payment into the central ledger.
  async postPayment(paymentId, invoice, amount, description, connection) {
    const { accountType, category } = getLedgerClassification(
      invoice.invoiceType || invoice.invoice_type
    );

    return await ledgerModel.create(
      {
        paymentId: Number(paymentId),
        invoiceId: invoice.id || invoice.invoice_id,
        leaseId: invoice.leaseId || invoice.lease_id,
        accountType,
        category,
        credit: Number(amount),
        description:
          description ||
          `Payment for ${invoice.description || invoice.invoice_type}`,
        entryDate: getCurrentDateString(),
      },
      connection
    );
  }
}

export default new LedgerService();
