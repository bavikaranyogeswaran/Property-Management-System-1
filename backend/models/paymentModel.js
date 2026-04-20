// ============================================================================
//  PAYMENT MODEL (The Cash Register)
// ============================================================================
//  This file records every single time money changes hands.
//  It tracks Cash, Bank Transfers, and checks if payments are Verified.
// ============================================================================

import crypto from 'crypto';
import pool from '../config/db.js';

class PaymentModel {
  // CREATE: Records a new capital injection (Cash, Bank Transfer, etc.) for a specific bill.
  async create(data, connection = null) {
    const {
      invoiceId,
      amount,
      paymentDate,
      paymentMethod,
      referenceNumber,
      evidenceUrl,
    } = data;
    const db = connection || pool;

    // 1. [INTEGRITY] Traceability: Ensure referenceNumber is never null to satisfy DB constraints
    let finalReference = referenceNumber;
    if (!finalReference) {
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 14);
      const randomStr = crypto.randomBytes(4).toString('hex').toUpperCase();
      finalReference = `SYS-PAY-${timestamp}-${randomStr}`;
    }

    try {
      // 2. [DATA] Persistence: Insert the record into the primary payment log
      const [result] = await db.query(
        'INSERT INTO payments (invoice_id, amount, payment_date, payment_method, reference_number, proof_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          invoiceId,
          amount,
          paymentDate,
          paymentMethod,
          finalReference,
          evidenceUrl,
          data.status || 'pending',
        ]
      );

      return result.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY')
        throw new Error('This payment reference number has already been used.');
      throw error;
    }
  }

  // MAP ROW: Standardizes the database record into a frontend-friendly DTO.
  mapRow(row) {
    if (!row) return null;
    return {
      id: row.payment_id.toString(),
      invoiceId: row.invoice_id.toString(),
      tenantId: row.tenant_id?.toString(),
      amount: Number(row.amount),
      paymentDate: row.payment_date,
      paymentMethod: row.payment_method,
      status: row.status,
      proofUrl: row.proof_url,
      referenceNumber: row.reference_number,
      createdAt: row.created_at,
      tenantName: row.tenant_name,
      leaseId: row.lease_id?.toString(),
      propertyId: row.property_id?.toString(),
    };
  }

  // FIND BY ID: Fetches a single payment record by its unique descriptor.
  async findById(id, connection = null) {
    const db = connection || pool;
    // 1. [QUERY] Direct Retrieval
    const [rows] = await db.query(
      'SELECT * FROM payments WHERE payment_id = ?',
      [id]
    );
    return this.mapRow(rows[0]);
  }

  // FIND ALL: System-wide registry of all money movements.
  async findAll() {
    // 1. [QUERY] Aggregate Retrieval: Joins through invoices and leases to resolve tenant identity
    const [rows] = await pool.query(`
            SELECT p.*, u.name as tenant_name, un.property_id, ri.lease_id, l.tenant_id
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN users u ON l.tenant_id = u.user_id
            ORDER BY p.payment_date DESC
        `);
    return rows.map((row) => this.mapRow(row));
  }

  // FIND BY OWNER ID: Lists all payments occurring within an investor's portfolio.
  async findByOwnerId(ownerId) {
    // 1. [QUERY] Multi-Join Filtered Retrieval: Resolves payment context across the unit hierarchy
    const [rows] = await pool.query(
      `SELECT p.*, u.name as tenant_name, un.property_id, ri.lease_id, l.tenant_id
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN properties prop ON un.property_id = prop.property_id
            JOIN users u ON l.tenant_id = u.user_id
            WHERE prop.owner_id = ?
            ORDER BY p.payment_date DESC`,
      [ownerId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // FIND BY TREASURER ID: Limits visibility to payment activity in properties assigned to the specific treasurer.
  async findByTreasurerId(treasurerId) {
    // 1. [QUERY] RBAC Filtered Join
    const [rows] = await pool.query(
      `SELECT p.*, u.name as tenant_name, un.property_id, ri.lease_id, l.tenant_id
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN staff_property_assignments spa ON un.property_id = spa.property_id
            JOIN users u ON l.tenant_id = u.user_id
            WHERE spa.user_id = ?
            ORDER BY p.payment_date DESC`,
      [treasurerId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // FIND BY INVOICE ID: Fetches all installments tied to a specific bill.
  async findByInvoiceId(invoiceId, connection = null) {
    const db = connection || pool;
    // 1. [QUERY] Direct Filter
    const [rows] = await db.query(
      'SELECT * FROM payments WHERE invoice_id = ?',
      [invoiceId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // FIND BY INVOICE IDS: Batch retrieval for reconciling multiple accounts.
  async findByInvoiceIds(invoiceIds, connection = null) {
    if (!invoiceIds || invoiceIds.length === 0) return [];
    const db = connection || pool;
    // 1. [QUERY] Variable Retrieval
    const [rows] = await db.query(
      'SELECT * FROM payments WHERE invoice_id IN (?)',
      [invoiceIds]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // FIND BY TENANT ID: History of all payments made by a specific resident.
  async findByTenantId(tenantId) {
    // 1. [QUERY] Multi-Level Join Retrieval
    const [rows] = await pool.query(
      `SELECT p.* 
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            WHERE l.tenant_id = ? 
            ORDER BY p.payment_date DESC`,
      [tenantId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // FIND BY REFERENCE: Resolution by external bank or system reference string.
  async findByReferenceNumber(referenceNumber, connection = null) {
    const db = connection || pool;
    // 1. [QUERY] Token Search
    const [rows] = await db.query(
      'SELECT * FROM payments WHERE reference_number = ?',
      [referenceNumber]
    );
    return this.mapRow(rows[0]);
  }

  // UPDATE STATUS: Moves a payment from 'pending' to 'verified' or 'failed'.
  async updateStatus(id, status, verifiedBy = null, connection = null) {
    const db = connection || pool;
    // 1. [DATA] State Persistence: Updates status to trigger DB-level accounting triggers
    const [result] = await db.query(
      'UPDATE payments SET status = ? WHERE payment_id = ? AND status != ?',
      [status, id, status]
    );

    return {
      payment: await this.findById(id, connection),
      changed: result.affectedRows > 0,
    };
  }
}

export default new PaymentModel();
