import pool from '../config/db.js';

class PaymentModel {
    async create(data) {
        const { invoiceId, tenantId, amount, paymentDate, paymentMethod, referenceNumber, evidenceUrl } = data;
        const [result] = await pool.query(
            'INSERT INTO payments (invoice_id, tenant_id, amount, payment_date, payment_method, reference_number, evidence_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [invoiceId, tenantId, amount, paymentDate, paymentMethod, referenceNumber, evidenceUrl, 'pending']
        );
        return result.insertId;
    }

    async findById(id) {
        const [rows] = await pool.query('SELECT * FROM payments WHERE payment_id = ?', [id]);
        return rows[0];
    }

    async findAll() {
        // For treasurer view - all payments
        const [rows] = await pool.query(`
            SELECT p.*, u.first_name, u.last_name, ri.property_id
            FROM payments p
            JOIN users u ON p.tenant_id = u.user_id
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            ORDER BY p.payment_date DESC
        `);
        return rows;
    }

    async findByTenantId(tenantId) {
        const [rows] = await pool.query('SELECT * FROM payments WHERE tenant_id = ? ORDER BY payment_date DESC', [tenantId]);
        return rows;
    }

    async updateStatus(id, status, verifiedBy = null) {
        // verifiedBy could be stored if we add that column, for now just status
        await pool.query('UPDATE payments SET status = ? WHERE payment_id = ?', [status, id]);

        // If approved, we might want to update the invoice status too - handled in controller transaction potentially?
        // Or simple model call.
        return this.findById(id);
    }
}

export default new PaymentModel();
