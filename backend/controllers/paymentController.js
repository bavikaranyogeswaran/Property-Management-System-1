import paymentModel from '../models/paymentModel.js';
import invoiceModel from '../models/invoiceModel.js';

class PaymentController {
    async submitPayment(req, res) {
        try {
            const { invoiceId, amount, paymentDate, paymentMethod, referenceNumber, evidenceUrl } = req.body;
            const tenantId = req.user.id;

            // TODO: Validate invoice belongs to tenant?

            const paymentId = await paymentModel.create({
                invoiceId,
                amount,
                paymentDate,
                paymentMethod,
                referenceNumber,
                evidenceUrl
            });

            // Status remains 'pending' until treasurer verifies
            res.status(201).json({ message: 'Payment submitted for verification', paymentId });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to submit payment' });
        }
    }

    async verifyPayment(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body; // 'verified' or 'rejected'

            if (req.user.role !== 'treasurer' && req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied' });
            }

            const updatedPayment = await paymentModel.updateStatus(id, status);

            if (status === 'verified') {
                // Update invoice status to 'paid'
                // In a real app, perform this in a transaction or check if partial payment
                const payment = await paymentModel.findById(id);
                if (payment) {
                    await invoiceModel.updateStatus(payment.invoice_id, 'paid');
                    // Also generate Receipt? (Future)
                }
            }

            res.json({ message: `Payment ${status}`, payment: updatedPayment });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to verify payment' });
        }
    }

    async getPayments(req, res) {
        try {
            if (req.user.role === 'tenant') {
                const payments = await paymentModel.findByTenantId(req.user.id);
                return res.json(payments);
            } else if (req.user.role === 'treasurer') {
                const payments = await paymentModel.findByTreasurerId(req.user.id);
                return res.json(payments);
            } else if (req.user.role === 'owner') {
                const payments = await paymentModel.findAll();
                return res.json(payments);
            } else {
                return res.status(403).json({ error: 'Access denied' });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch payments' });
        }
    }
}

export default new PaymentController();
