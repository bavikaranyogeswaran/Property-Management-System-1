import pool from '../config/db.js';

class ReceiptModel {
    async create(data) {
        const { paymentId, invoiceId, tenantId, amount, generatedDate, receiptNumber } = data;
        const [result] = await pool.query(
            'INSERT INTO receipts (payment_id, invoice_id, tenant_id, amount, created_at, receipt_number) VALUES (?, ?, ?, ?, ?, ?)',
            [paymentId, invoiceId, tenantId, amount, generatedDate, receiptNumber]
        );
        return result.insertId;
    }

    async findById(id) {
        const [rows] = await pool.query('SELECT * FROM receipts WHERE receipt_id = ?', [id]);
        return rows[0];
    }

    async findByInvoiceId(invoiceId) {
        const [rows] = await pool.query('SELECT * FROM receipts WHERE invoice_id = ?', [invoiceId]);
        return rows[0];
    }

    // For owner/treasurer to see all
    async findAll() {
        const [rows] = await pool.query('SELECT * FROM receipts ORDER BY created_at DESC');
        return rows;
    }
}

export default new ReceiptModel();
