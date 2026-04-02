import invoiceModel from '../models/invoiceModel.js';
import paymentService from '../services/paymentService.js';
import leaseModel from '../models/leaseModel.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

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

  /**
   * For polling: Checks if the payment was successful and the lease is active.
   * If so, returns an onboarding token for the tenant.
   */
  async getActivationStatus(req, res) {
    try {
      const { token } = req.params;
      const invoice = await invoiceModel.findByMagicToken(token);
      
      if (!invoice) {
        return res.status(404).json({ error: 'Invalid or expired token.' });
      }

      // Check if invoice is paid
      const isPaid = invoice.status === 'paid';
      
      // Check associated lease status
      const lease = await leaseModel.findById(invoice.leaseId);
      const isActive = lease && lease.status === 'active';

      let setupToken = null;
      if (isPaid && isActive) {
        // Generate a standard onboarding token
        setupToken = jwt.sign(
          { id: Number(lease.tenantId), type: 'setup_password', role: 'tenant' },
          JWT_SECRET,
          { expiresIn: '1h' } // Short-lived for this specific redirect
        );
      }

      res.json({
        paid: isPaid,
        active: isActive,
        type: invoice.invoiceType,
        setupToken: setupToken
      });
    } catch (error) {
       console.error('Check Activation Status Error:', error);
       res.status(500).json({ error: 'Failed to check status' });
    }
  }

  /**
   * For polling: Checks status using the PayHere order_id.
   * Securely verifies that the order_id matches the invoice before returning status.
   */
  async getActivationStatusByOrder(req, res) {
    try {
      const { orderId } = req.params;
      const invoice = await invoiceModel.findByOrderId(orderId);
 
      if (!invoice) {
        return res.status(404).json({ error: 'Order not found.' });
      }
 
      // Reuse the same verification logic as the token-based check
      const isPaid = invoice.status === 'paid';
      const lease = await leaseModel.findById(invoice.leaseId);
      const isActive = lease && lease.status === 'active';
 
      let setupToken = null;
      if (isPaid && isActive) {
        setupToken = jwt.sign(
          { id: Number(lease.tenantId), type: 'setup_password', role: 'tenant' },
          JWT_SECRET,
          { expiresIn: '1h' }
        );
      }
 
      res.json({
        paid: isPaid,
        active: isActive,
        type: invoice.invoiceType,
        setupToken: setupToken
      });
    } catch (error) {
       console.error('Check Order Status Error:', error);
       res.status(500).json({ error: 'Failed to check order status' });
    }
  }

  /**
   * Comprehensive Onboarding Status for the Status Tracker.
   * Returns invoice, lease, and verification status for a given magic token.
   */
  async getStatus(req, res) {
    try {
      const { token } = req.params;
      const invoice = await invoiceModel.findByMagicToken(token);
      
      if (!invoice) {
        return res.status(404).json({ error: 'Invalid or expired onboarding link.' });
      }

      // Fetch the full lease to get verification details
      const lease = await leaseModel.findById(invoice.leaseId);
      if (!lease) {
        return res.status(404).json({ error: 'Lease not found.' });
      }

      res.json({
        invoice: {
          id: invoice.id,
          amount: invoice.amount,
          status: invoice.status,
          type: invoice.invoiceType,
          description: invoice.description
        },
        lease: {
          id: lease.id,
          status: lease.status,
          verification: {
            isVerified: lease.isDocumentsVerified,
            status: lease.verificationStatus, // pending, verified, rejected
            reason: lease.verificationRejectionReason,
            documentUrl: lease.documentUrl
          }
        },
        property: {
          name: invoice.propertyName,
          unitNumber: invoice.unitNumber
        }
      });
    } catch (error) {
      console.error('Get Onboarding Status Error:', error);
      res.status(500).json({ error: 'Failed to fetch status' });
    }
  }
}

export default new GuestPaymentController();
