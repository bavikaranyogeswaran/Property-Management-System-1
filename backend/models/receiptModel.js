import pool from '../config/db.js';

class ReceiptModel {
  async create(data) {
    const {
      paymentId,
      invoiceId,
      tenantId,
      amount,
      generatedDate,
      receiptNumber,
    } = data;
    // generatedDate becomes receipt_date. Ensure valid date linked to payment.
    const dateValue = generatedDate ? new Date(generatedDate) : new Date();

    const [result] = await pool.query(
      'INSERT INTO receipts (payment_id, amount, receipt_date, receipt_number) VALUES (?, ?, ?, ?)',
      [paymentId, amount, dateValue, receiptNumber]
    );
    return result.insertId;
  }

  async findById(id) {
    const [rows] = await pool.query(
      `
            SELECT r.*, p.invoice_id, l.tenant_id, 
                   pr.name as property_name, u.unit_number,
                   tu.name as tenant_name, tu.email as tenant_email,
                   p.payment_method, p.payment_date, i.description
            FROM receipts r 
            LEFT JOIN payments p ON r.payment_id = p.payment_id 
            LEFT JOIN rent_invoices i ON p.invoice_id = i.invoice_id
            LEFT JOIN leases l ON i.lease_id = l.lease_id
            LEFT JOIN units u ON l.unit_id = u.unit_id
            LEFT JOIN properties pr ON u.property_id = pr.property_id
            LEFT JOIN users tu ON l.tenant_id = tu.user_id
            WHERE r.receipt_id = ?
        `,
      [id]
    );
    return this.mapRow(rows[0]);
  }

  async findAll() {
    const [rows] = await pool.query(`
            SELECT r.*, p.invoice_id, l.tenant_id, 
                   pr.name as property_name, u.unit_number,
                   tu.name as tenant_name, tu.email as tenant_email,
                   p.payment_method, p.payment_date, i.description
            FROM receipts r 
            LEFT JOIN payments p ON r.payment_id = p.payment_id 
            LEFT JOIN rent_invoices i ON p.invoice_id = i.invoice_id
            LEFT JOIN leases l ON i.lease_id = l.lease_id
            LEFT JOIN units u ON l.unit_id = u.unit_id
            LEFT JOIN properties pr ON u.property_id = pr.property_id
            LEFT JOIN users tu ON l.tenant_id = tu.user_id
            ORDER BY r.receipt_date DESC
        `);
    return rows.map((row) => this.mapRow(row));
  }

  mapRow(row) {
    if (!row) return null;
    return {
      id: row.receipt_id.toString(),
      paymentId: row.payment_id.toString(),
      invoiceId: row.invoice_id ? row.invoice_id.toString() : null,
      tenantId: row.tenant_id ? row.tenant_id.toString() : null,
      amount: parseFloat(row.amount),
      receiptDate: row.receipt_date,
      receiptNumber: row.receipt_number,
      createdAt: row.receipt_date,
      propertyName: row.property_name || null,
      unitNumber: row.unit_number || null,
      tenantName: row.tenant_name || null,
      tenantEmail: row.tenant_email || null,
      // Added payment details
      paymentMethod: row.payment_method || null,
      paymentDate: row.payment_date || null,
      description: row.description || `Invoice #${row.invoice_id}`,
    };
  }
  async findByPaymentId(paymentId) {
    const [rows] = await pool.query(
      'SELECT * FROM receipts WHERE payment_id = ?',
      [paymentId]
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }
}

export default new ReceiptModel();
