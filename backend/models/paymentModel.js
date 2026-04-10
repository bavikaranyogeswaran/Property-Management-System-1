// ============================================================================
//  PAYMENT MODEL (The Cash Register)
// ============================================================================
//  This file records every single time money changes hands.
//  It tracks Cash, Bank Transfers, and checks if payments are Verified.
// ============================================================================

import crypto from 'crypto';
import pool from '../config/db.js';

class PaymentModel {
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

    // [INTEGRITY HARDENING] Ensure referenceNumber is never null to satisfy DB constraints
    // This provides a traceable ID for manual (cash/cheque) payments.
    let finalReference = referenceNumber;
    if (!finalReference) {
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 14); // YYYYMMDDHHmmss
      const randomStr = crypto.randomBytes(4).toString('hex').toUpperCase();
      finalReference = `SYS-PAY-${timestamp}-${randomStr}`;
    }

    try {
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

      // [H1 FIX] amount_paid is maintained by DB trigger trg_invoice_amount_paid_insert.
      // No application-level cache update needed here.

      return result.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('This payment reference number has already been used.');
      }
      throw error;
    }
  }

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
      // Joined fields
      tenantName: row.tenant_name,
      leaseId: row.lease_id?.toString(),
      propertyId: row.property_id?.toString(),
    };
  }

  async findById(id, connection = null) {
    const db = connection || pool;
    const [rows] = await db.query(
      'SELECT * FROM payments WHERE payment_id = ?',
      [id]
    );
    return this.mapRow(rows[0]);
  }

  async findAll() {
    // For treasurer view - all payments
    // tenant_id is not in payments, need to join invoices -> leases -> tenants -> users
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

  async findByOwnerId(ownerId) {
    const [rows] = await pool.query(
      `
            SELECT p.*, u.name as tenant_name, un.property_id, ri.lease_id, l.tenant_id
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN properties prop ON un.property_id = prop.property_id
            JOIN users u ON l.tenant_id = u.user_id
            WHERE prop.owner_id = ?
            ORDER BY p.payment_date DESC
        `,
      [ownerId]
    );
    return rows.map((row) => ({
      id: row.payment_id.toString(),
      invoiceId: row.invoice_id.toString(),
      tenantId: row.tenant_id.toString(),
      amount: Number(row.amount),
      paymentDate: row.payment_date,
      paymentMethod: row.payment_method,
      status: row.status,
      proofUrl: row.proof_url,
      referenceNumber: row.reference_number,
      createdAt: row.created_at,
      tenantName: row.tenant_name,
      leaseId: row.lease_id.toString(),
      propertyId: row.property_id.toString(),
    }));
  }

  async findByTreasurerId(treasurerId) {
    const [rows] = await pool.query(
      `
            SELECT p.*, u.name as tenant_name, un.property_id, ri.lease_id, l.tenant_id
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN staff_property_assignments spa ON un.property_id = spa.property_id
            JOIN users u ON l.tenant_id = u.user_id
            WHERE spa.user_id = ?
            ORDER BY p.payment_date DESC
        `,
      [treasurerId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  async findByInvoiceId(invoiceId, connection = null) {
    const db = connection || pool;
    const [rows] = await db.query(
      'SELECT * FROM payments WHERE invoice_id = ?',
      [invoiceId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  async findByInvoiceIds(invoiceIds, connection = null) {
    if (!invoiceIds || invoiceIds.length === 0) return [];
    const db = connection || pool;
    const [rows] = await db.query(
      'SELECT * FROM payments WHERE invoice_id IN (?)',
      [invoiceIds]
    );
    return rows.map((row) => this.mapRow(row));
  }

  async findByTenantId(tenantId) {
    const [rows] = await pool.query(
      `
            SELECT p.* 
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            WHERE l.tenant_id = ? 
            ORDER BY p.payment_date DESC
        `,
      [tenantId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  async findByReferenceNumber(referenceNumber, connection = null) {
    const db = connection || pool;
    const [rows] = await db.query(
      'SELECT * FROM payments WHERE reference_number = ?',
      [referenceNumber]
    );
    return this.mapRow(rows[0]);
  }

  async updateStatus(id, status, verifiedBy = null, connection = null) {
    const db = connection || pool;
    // verifiedBy could be stored if we add that column, for now just status
    const [result] = await db.query(
      'UPDATE payments SET status = ? WHERE payment_id = ? AND status != ?',
      [status, id, status]
    );

    // [H1 FIX] rent_invoices.amount_paid is now maintained by DB triggers:
    //   trg_invoice_amount_paid_insert — fires on new payment inserts
    //   trg_invoice_amount_paid_update — fires on ANY status change, handles
    //     both gains (pending→verified) AND losses (verified→rejected) of
    //     verified status atomically. No application code needed here.

    return {
      payment: await this.findById(id, connection),
      changed: result.affectedRows > 0,
    };
  }
}

export default new PaymentModel();
