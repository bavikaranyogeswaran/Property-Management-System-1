import pool from '../config/db.js';

class ReceiptModel {
    async create(data) {
        const { paymentId, invoiceId, tenantId, amount, generatedDate, receiptNumber } = data;
        // generatedDate becomes receipt_date. Ensure valid date linked to payment.
        const dateValue = generatedDate ? new Date(generatedDate) : new Date();

        const [result] = await pool.query(
            'INSERT INTO receipts (payment_id, amount, receipt_date, receipt_number) VALUES (?, ?, ?, ?)',
            [paymentId, amount, dateValue, receiptNumber]
        );
        return result.insertId;
    }

    async findById(id) {
        const [rows] = await pool.query(`
            SELECT r.*, p.invoice_id, l.tenant_id 
            FROM receipts r 
            LEFT JOIN payments p ON r.payment_id = p.payment_id 
            LEFT JOIN rent_invoices i ON p.invoice_id = i.invoice_id
            LEFT JOIN leases l ON i.lease_id = l.lease_id
            WHERE r.receipt_id = ?
        `, [id]);
        return this.mapRow(rows[0]);
    }

    async findAll() {
        // Need to join payments -> invoices -> leases to get tenant_id
        const [rows] = await pool.query(`
            SELECT r.*, p.invoice_id, l.tenant_id 
            FROM receipts r 
            LEFT JOIN payments p ON r.payment_id = p.payment_id 
            LEFT JOIN rent_invoices i ON p.invoice_id = i.invoice_id
            LEFT JOIN leases l ON i.lease_id = l.lease_id
            ORDER BY r.receipt_date DESC
        `);
        return rows.map(row => this.mapRow(row));
    }

    mapRow(row) {
        if (!row) return null;
        return {
            id: row.receipt_id.toString(),
            paymentId: row.payment_id.toString(),
            // invoiceId from payments table join
            invoiceId: row.invoice_id ? row.invoice_id.toString() : null,
            // tenantId from leases table join (via rent_invoices)
            tenantId: row.tenant_id ? row.tenant_id.toString() : null,
            amount: parseFloat(row.amount),
            receiptDate: row.receipt_date,
            receiptNumber: row.receipt_number,
            createdAt: row.receipt_date
        };
    }
}

export default new ReceiptModel();
