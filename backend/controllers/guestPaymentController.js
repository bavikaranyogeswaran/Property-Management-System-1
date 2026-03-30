import invoiceModel from '../models/invoiceModel.js';
import paymentService from '../services/paymentService.js';

class GuestPaymentController {
  async getInvoiceDetails(req, res) {
    try {
      const { token } = req.params;
      const invoice = await invoiceModel.findByMagicToken(token);
      
      if (!invoice) {
        return res.status(404).json({ error: 'Invalid or expired payment link.' });
      }
      
      if (invoice.status === 'paid') {
        return res.status(400).json({ error: 'This invoice has already been paid.' });
      }

      // Return only safe public information
      res.json({
        id: invoice.id,
        amount: invoice.amount,
        type: invoice.invoiceType,
        propertyName: invoice.propertyName,
        unitNumber: invoice.unitNumber,
        description: invoice.description,
        status: invoice.status
      });
    } catch (error) {
      console.error('Magic Link GET Error:', error);
      res.status(500).json({ error: 'Failed to fetch payment details' });
    }
  }

  async submitPayment(req, res) {
    try {
      const { token } = req.params;
      const file = req.file; // From multer
      
      const paymentId = await paymentService.submitGuestPayment(req.body, token, file);
      
      res.status(201).json({ 
        message: 'Payment evidence submitted successfully. Our team will verify it shortly.',
        paymentId 
      });
    } catch (error) {
      console.error('Magic Link POST Error:', error);
      res.status(400).json({ error: error.message || 'Failed to submit payment' });
    }
  }
}

export default new GuestPaymentController();
