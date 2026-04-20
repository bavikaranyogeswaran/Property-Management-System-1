// ============================================================================
//  RECEIPT MODEL (The Proof Drawer)
// ============================================================================
//  Records generated payment proofs for tenants.
// ============================================================================

import pool from '../config/db.js';
import { getLocalTime, parseLocalDate } from '../utils/dateUtils.js';

class ReceiptModel {
  // CREATE: Records a formal proof of payment after verification.
  async create(data, connection = null) {
    const {
      paymentId,
      invoiceId,
      tenantId,
      amount,
      generatedDate,
      receiptNumber,
    } = data;
    // 1. [DATA] Transformation: Ensure valid receipt timestamp linked to the payment event
    const dateValue = generatedDate
      ? parseLocalDate(generatedDate)
      : getLocalTime();

    const db = connection || pool;
    // 2. [DATA] Persistence
    const [result] = await db.query(
      'INSERT INTO receipts (payment_id, receipt_date, receipt_number) VALUES (?, ?, ?)',
      [paymentId, dateValue, receiptNumber]
    );
    return result.insertId;
  }

  // FIND BY ID: Fetches a single receipt with full contextual metadata for PDF generation.
  async findById(id) {
    // 1. [QUERY] Massive Join: Resolves payment, invoice, lease, and tenant details for the document body
    const [rows] = await pool.query(
      `SELECT r.*, p.amount, p.invoice_id, l.tenant_id, 
                   pr.name as property_name, u.unit_number,
                   tu.name as tenant_name, tu.email as tenant_email,
                   p.payment_method, p.payment_date, i.description
            FROM receipts r 
            JOIN payments p ON r.payment_id = p.payment_id 
            LEFT JOIN rent_invoices i ON p.invoice_id = i.invoice_id
            LEFT JOIN leases l ON i.lease_id = l.lease_id
            LEFT JOIN units u ON l.unit_id = u.unit_id
            LEFT JOIN properties pr ON u.property_id = pr.property_id
            LEFT JOIN users tu ON l.tenant_id = tu.user_id
            WHERE r.receipt_id = ?`,
      [id]
    );
    return this.mapRow(rows[0]);
  }

  // FIND ALL: System-wide registry of all generated receipts.
  async findAll() {
    // 1. [QUERY] Global Extraction with multi-level joins
    const [rows] = await pool.query(`
            SELECT r.*, p.amount, p.invoice_id, l.tenant_id, 
                   pr.name as property_name, u.unit_number,
                   tu.name as tenant_name, tu.email as tenant_email,
                   p.payment_method, p.payment_date, i.description
            FROM receipts r 
            JOIN payments p ON r.payment_id = p.payment_id 
            LEFT JOIN rent_invoices i ON p.invoice_id = i.invoice_id
            LEFT JOIN leases l ON i.lease_id = l.lease_id
            LEFT JOIN units u ON l.unit_id = u.unit_id
            LEFT JOIN properties pr ON u.property_id = pr.property_id
            LEFT JOIN users tu ON l.tenant_id = tu.user_id
            ORDER BY r.receipt_date DESC
        `);
    return rows.map((row) => this.mapRow(row));
  }

  // FIND BY OWNER ID: Filters proofs to those belonging to an investor's properties.
  async findByOwnerId(ownerId) {
    // 1. [QUERY] Ownership Filtered Join
    const [rows] = await pool.query(
      `SELECT r.*, p.amount, p.invoice_id, l.tenant_id, 
                   pr.name as property_name, u.unit_number,
                   tu.name as tenant_name, tu.email as tenant_email,
                   p.payment_method, p.payment_date, i.description
            FROM receipts r 
            JOIN payments p ON r.payment_id = p.payment_id 
            LEFT JOIN rent_invoices i ON p.invoice_id = i.invoice_id
            LEFT JOIN leases l ON i.lease_id = l.lease_id
            LEFT JOIN units u ON l.unit_id = u.unit_id
            LEFT JOIN properties pr ON u.property_id = pr.property_id
            LEFT JOIN users tu ON l.tenant_id = tu.user_id
            WHERE pr.owner_id = ?
            ORDER BY r.receipt_date DESC`,
      [ownerId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // FIND BY TREASURER ID: Limits visibility to receipts assigned to the specific treasurer.
  async findByTreasurerId(treasurerId) {
    // 1. [QUERY] RBAC Filtered Join: Resolves via property-staff assignment
    const [rows] = await pool.query(
      `SELECT r.*, p.amount, p.invoice_id, l.tenant_id, 
                   pr.name as property_name, u.unit_number,
                   tu.name as tenant_name, tu.email as tenant_email,
                   p.payment_method, p.payment_date, i.description
            FROM receipts r 
            JOIN payments p ON r.payment_id = p.payment_id 
            LEFT JOIN rent_invoices i ON p.invoice_id = i.invoice_id
            LEFT JOIN leases l ON i.lease_id = l.lease_id
            LEFT JOIN units u ON l.unit_id = u.unit_id
            LEFT JOIN properties pr ON u.property_id = pr.property_id
            LEFT JOIN staff_property_assignments spa ON pr.property_id = spa.property_id
            LEFT JOIN users tu ON l.tenant_id = tu.user_id
            WHERE spa.user_id = ?
            ORDER BY r.receipt_date DESC`,
      [treasurerId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // MAP ROW: Standardizes the complex join result into a flattened proof DTO.
  mapRow(row) {
    if (!row) return null;
    return {
      id: row.receipt_id.toString(),
      paymentId: row.payment_id.toString(),
      invoiceId: row.invoice_id ? row.invoice_id.toString() : null,
      tenantId: row.tenant_id ? row.tenant_id.toString() : null,
      amount: Number(row.amount),
      receiptDate: row.receipt_date,
      receiptNumber: row.receipt_number,
      createdAt: row.receipt_date,
      propertyName: row.property_name || null,
      unitNumber: row.unit_number || null,
      tenantName: row.tenant_name || null,
      tenantEmail: row.tenant_email || null,
      paymentMethod: row.payment_method || null,
      paymentDate: row.payment_date || null,
      description: row.description || `Invoice #${row.invoice_id}`,
    };
  }

  // FIND BY PAYMENT ID: Fetches the receipt linked to a specific verified payment.
  async findByPaymentId(paymentId, connection = null) {
    const db = connection || pool;
    // 1. [QUERY] Filtered Retrieval
    const [rows] = await db.query(
      'SELECT r.*, p.amount FROM receipts r JOIN payments p ON r.payment_id = p.payment_id WHERE r.payment_id = ?',
      [paymentId]
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }
}

export default new ReceiptModel();
