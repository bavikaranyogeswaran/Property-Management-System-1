// ============================================================================
//  RECEIPT CONTROLLER (The Records Keeper)
// ============================================================================
//  This file allows people to see proof of their payments.
//  "Show me the receipt for that $500 I paid last month."
// ============================================================================

import receiptModel from '../models/receiptModel.js';

class ReceiptController {
  async getReceipts(req, res) {
    try {
      // If tenant, only show their receipts?
      // Existing logic in invoiceController suggests filtering by role.
      // Let's implement role-based filtering here too.
      // Note: receiptModel currently has findAll (owner/treasurer) and findByInvoiceId.
      // Ideally we need findByTenantId.

      // For now, let's just return all for owner/treasurer, and maybe filter in memory or add method later?
      // Actually, let's just use findAll for now as per previous pattern.

      const receipts = await receiptModel.findAll();

      // Debug Logs
      console.log(
        `[DEBUG] getReceipts: Found ${receipts.length} total receipts.`
      );
      if (receipts.length > 0) {
        console.log(
          `[DEBUG] First receipt tenantId: ${receipts[0].tenantId} (Type: ${typeof receipts[0].tenantId})`
        );
      }
      console.log(
        `[DEBUG] User Role: ${req.user.role}, User ID: ${req.user.id} (Type: ${typeof req.user.id})`
      );

      if (req.user.role === 'tenant') {
        const filtered = receipts.filter(
          (r) => r.tenantId === req.user.id.toString()
        );
        console.log(
          `[DEBUG] Filtered for tenant: ${filtered.length} receipts.`
        );
        return res.json(filtered);
      }
      return res.json(receipts);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch receipts' });
    }
  }
}

export default new ReceiptController();
