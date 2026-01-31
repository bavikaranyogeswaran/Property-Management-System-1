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
            if (req.user.role === 'tenant') {
                return res.json(receipts.filter(r => r.tenant_id === req.user.id));
            }
            return res.json(receipts);

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch receipts' });
        }
    }
}

export default new ReceiptController();
