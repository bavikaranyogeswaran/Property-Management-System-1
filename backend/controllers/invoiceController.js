// ============================================================================
//  INVOICE CONTROLLER (The Billing Department)
// ============================================================================
//  This file handles the "Bills".
//  It sends rent bills to tenants and tracks if they are paid or overdue.
// ============================================================================

import invoiceService from '../services/invoiceService.js';

class InvoiceController {
  // GET INVOICES: Retrieves a filtered list of bills (RBAC-aware).
  async getInvoices(req, res) {
    try {
      // 1. [DELEGATION] Visibility Logic: Fetch invoices the user is authorized to see (e.g., Tenant sees only theirs)
      const invoices = await invoiceService.getInvoices(req.user);
      return res.json(invoices);
    } catch (error) {
      console.error(error);
      if (error.message.includes('Access denied'))
        return res.status(403).json({ error: error.message });
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  }

  // CREATE INVOICE: Allows staff/owners to manually issue a one-off bill (e.g., for damages).
  async createInvoice(req, res) {
    try {
      // 1. [DELEGATION] Creation Logic: Verify permissions and anchor invoice to a lease
      const id = await invoiceService.createInvoice(req.body, req.user);
      res.status(201).json({ message: 'Invoice created', id });
    } catch (error) {
      console.error(error);
      if (error.message.includes('Denied'))
        return res.status(403).json({ error: error.message });
      res.status(500).json({ error: 'Error creating invoice' });
    }
  }

  // GENERATE MONTHLY RENT: The bulk billing engine triggered for specific periods.
  async generateMonthlyInvoices(req, res) {
    try {
      const { year, month } = req.body;
      // 1. [DELEGATION] Orchestration: Scan all active leases and generate rent invoices for the target month
      const result = await invoiceService.generateMonthlyInvoices(
        year,
        month,
        req.user
      );

      res.json({ message: 'Invoice generation complete', ...result });
    } catch (error) {
      console.error('Error generating invoices:', error);
      // 2. [CONCURRENCY] Conflict resolution: Prevent duplicate runs
      if (error.message.includes('already in progress'))
        return res.status(409).json({ error: error.message });
      if (error.message.includes('recently completed'))
        return res.status(429).json({ error: error.message });
      if (error.message.includes('Access denied'))
        return res.status(403).json({ error: error.message });
      res.status(500).json({ error: 'Failed to generate invoices' });
    }
  }

  // UPDATE STATUS: Marking a bill as 'Paid', 'Overdue', or 'Cancelled'.
  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // 1. [DELEGATION] State Machine: Transition invoice status and trigger ledger side-effects
      const updatedInvoice = await invoiceService.updateStatus(
        id,
        status,
        req.user
      );

      res.json({
        message: `Invoice status updated to ${status}`,
        invoice: updatedInvoice,
      });
    } catch (error) {
      console.error(error);
      if (error.message.includes('Access denied'))
        return res.status(403).json({ error: error.message });
      if (
        error.message.includes('measure') ||
        error.message.includes('Cannot mark')
      )
        return res.status(400).json({ error: error.message });
      if (error.message.includes('not found'))
        return res.status(404).json({ error: error.message });
      res.status(500).json({ error: 'Failed to update invoice status' });
    }
  }

  // CORRECT INVOICE: Allows Treasurers to adjust amount on an existing bill.
  async correctInvoice(req, res) {
    try {
      const { id } = req.params;
      const { newAmount, reason } = req.body;

      // 1. [VALIDATION] Integrity guard
      if (!newAmount || !reason)
        return res
          .status(400)
          .json({ error: 'newAmount and reason are required' });

      // 2. [DELEGATION] Adjustment Logic: Record the change and update the balance
      const result = await invoiceService.correctInvoice(
        id,
        newAmount,
        reason,
        req.user
      );

      res
        .status(200)
        .json({ message: 'Invoice corrected successfully', ...result });
    } catch (error) {
      console.error('Error correcting invoice:', error);
      if (
        error.message.includes('Access denied') ||
        error.message.includes('Only treasurers')
      )
        return res.status(403).json({ error: error.message });
      if (error.message.includes('not found'))
        return res.status(404).json({ error: error.message });
      if (error.message.includes('Cannot correct'))
        return res.status(400).json({ error: error.message });
      res.status(500).json({ error: 'Failed to correct invoice' });
    }
  }
}

export default new InvoiceController();
