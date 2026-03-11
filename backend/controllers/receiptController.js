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
      if (req.user.role === 'owner') {
        const receipts = await receiptModel.findByOwnerId(req.user.id);
        return res.json(receipts);
      } else if (req.user.role === 'treasurer') {
        const receipts = await receiptModel.findByTreasurerId(req.user.id);
        return res.json(receipts);
      } else if (req.user.role === 'tenant') {
        const receipts = await receiptModel.findAll();
        const filtered = receipts.filter(
          (r) => r.tenantId === req.user.id.toString()
        );
        return res.json(filtered);
      } else {
        const receipts = await receiptModel.findAll();
        return res.json(receipts);
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch receipts' });
    }
  }
}

export default new ReceiptController();
