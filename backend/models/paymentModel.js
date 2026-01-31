import pool from '../config/db.js';

class PaymentModel {
    async create(data) {
        const { invoiceId, amount, paymentDate, paymentMethod, referenceNumber, evidenceUrl } = data;
        const [result] = await pool.query(
            'INSERT INTO payments (invoice_id, amount, payment_date, payment_method, reference_number, proof_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [invoiceId, amount, paymentDate, paymentMethod, referenceNumber, evidenceUrl, 'pending']
        );
        return result.insertId;
    }

    async findById(id) {
        const [rows] = await pool.query('SELECT * FROM payments WHERE payment_id = ?', [id]);
        return rows[0];
    }

    async findAll() {
        // For treasurer view - all payments
        // tenant_id is not in payments, need to join invoices -> leases -> tenants -> users
        const [rows] = await pool.query(`
            SELECT p.*, u.name, un.property_id, ri.lease_id, l.tenant_id
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN users u ON l.tenant_id = u.user_id
            ORDER BY p.payment_date DESC
        `);
        return rows;
    }

    async findByTreasurerId(treasurerId) {
        const [rows] = await pool.query(`
            SELECT p.*, u.name, un.property_id, ri.lease_id, l.tenant_id
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN start_property_assignments spa ON un.property_id = spa.property_id
            JOIN users u ON l.tenant_id = u.user_id
            WHERE spa.user_id = ?
            ORDER BY p.payment_date DESC
        `, [treasurerId]);
        return rows;
    }

    async findByInvoiceId(invoiceId) {
        const [rows] = await pool.query('SELECT * FROM payments WHERE invoice_id = ?', [invoiceId]);
        return rows;
    }

    async findByTenantId(tenantId) {
        const [rows] = await pool.query(`
            SELECT p.* 
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            WHERE l.tenant_id = ? 
            ORDER BY p.payment_date DESC
        `, [tenantId]);
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
