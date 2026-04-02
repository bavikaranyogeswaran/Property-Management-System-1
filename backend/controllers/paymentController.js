// ============================================================================
//  PAYMENT CONTROLLER (The Bank Teller)
// ============================================================================
//  This file handles all money coming IN.
//  - Tenants submitting proof of payment.
//  - Treasurers verifying the money is in the bank.
//  - Generating Receipts.
// ============================================================================

import paymentService from '../services/paymentService.js';

class PaymentController {
  //  SUBMIT PAYMENT: Tenant uploads a slip or says "I paid X amount".
  async submitPayment(req, res) {
    try {
      const tenantId = req.user.id;
      // Pass the file object if it exists
      const paymentId = await paymentService.submitPayment(req.body, tenantId, req.file);

      res
        .status(201)
        .json({ message: 'Payment submitted for verification', paymentId });
    } catch (error) {
      console.error(error);
      if (error.message === 'Invoice not found' || error.message.includes('already been paid')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to submit payment' });
    }
  }



  //  VERIFY PAYMENT: Treasurer looks at bank statement and says "Yes, money is here".
  async verifyPayment(req, res) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body; // 'verified' or 'rejected'

      const updatedPayment = await paymentService.verifyPayment(id, status, req.user, reason);

      res.json({ message: `Payment ${status}`, payment: updatedPayment });
    } catch (error) {
      console.error('--- verifyPayment ERROR ---');
      console.error(error);
      if (error.message.includes('Access denied')) {
           return res.status(403).json({ error: error.message });
      }
      if (error.message.includes('not found')) {
           return res.status(404).json({ error: error.message });
      }
      res
        .status(500)
        .json({ error: 'Failed to verify payment: ' + error.message });
    }
  }

  async getPayments(req, res) {
    try {
      const payments = await paymentService.getPayments(req.user);
      return res.json(payments);
    } catch (error) {
      console.error(error);
      if (error.message.includes('Access denied')) {
          return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to fetch payments' });
    }
  }
}

export default new PaymentController();
