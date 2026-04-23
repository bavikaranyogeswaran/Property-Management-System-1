// ============================================================================
//  INVOICE MODEL (The Bill Records)
// ============================================================================
//  This file keeps track of every bill we've ever sent.
//  It records who owes money, how much, and for what (Rent, Maintenance).
// ============================================================================

import pool from '../config/db.js';
import { getCurrentDateString, parseLocalDate } from '../utils/dateUtils.js';
import { fromCents, roundToCents } from '../utils/moneyUtils.js';

class InvoiceModel {
  // CREATE: Writing a new bill to the ledger.
  // NOTE: Email notifications are handled by the caller (service/controller/cron layer).
  async create(data, connection = null) {
    const {
      leaseId,
      amount,
      dueDate,
      description,
      type,
      magicTokenHash,
      magicTokenExpiresAt,
    } = data;

    // 1. [TRANSFORMATION] Time Normalization: Derive accounting period from the due date
    const date = parseLocalDate(dueDate);
    const year = data.year || date.getFullYear();
    const month = data.month || date.getMonth() + 1; // 1-12

    const db = connection || pool;
    try {
      // 2. [DATA] Persistence: Insert the invoice into the primary tracking table
      const [result] = await db.query(
        'INSERT INTO rent_invoices (lease_id, year, month, amount, due_date, status, invoice_type, description, magic_token_hash, magic_token_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          leaseId,
          year,
          month,
          amount,
          dueDate,
          'pending',
          type,
          description,
          magicTokenHash || null,
          magicTokenExpiresAt || null,
        ]
      );
      const invoiceId = result.insertId;

      // 3. [SIDE EFFECT] Ledger Posting: Mirror the invoice into the general ledger for financial reporting
      if (invoiceId) {
        try {
          const ledgerModel = (await import('./ledgerModel.js')).default;
          // Use dynamic import to avoid potential circular dependencies
          const accountType = type === 'deposit' ? 'liability' : 'revenue';
          const category =
            type === 'deposit' ? 'deposit_accrued' : type || 'rent';

          await ledgerModel.create(
            {
              invoiceId,
              leaseId,
              accountType,
              category,
              debit: roundToCents(amount),
              description: `Generated ${type || 'rent'} invoice: ${description || 'No description'}`,
              entryDate: getCurrentDateString(),
            },
            db
          );
        } catch (ledgerErr) {
          console.error(
            'Failed to post initial ledger entry for invoice:',
            ledgerErr
          );
        }
      }

      return invoiceId;
    } catch (error) {
      // 4. [INTEGRITY] Duplicate Guard: Prevent double-billing for the same period/type
      if (error.code === 'ER_DUP_ENTRY') {
        console.warn(
          `Duplicate invoice detected: Lease ${leaseId}, Period ${year}-${month}, Type ${type}`
        );
        return null;
      }
      throw error;
    }
  }

  // EXISTS: Collision check to see if a bill already covers a specific month.
  async exists(leaseId, year, month, type = null, connection = null) {
    let query =
      'SELECT invoice_id FROM rent_invoices WHERE lease_id = ? AND year = ? AND month = ?';
    const params = [leaseId, year, month];

    if (type) {
      query += ' AND invoice_type = ?';
      params.push(type);
    }

    const db = connection || pool;
    // 1. [QUERY] Execution
    const [rows] = await db.query(query, params);
    return rows.length > 0;
  }

  // GET PENDING TOTAL: Calculates the outstanding debt for a specific lease.
  async getPendingTotal(leaseId) {
    // 1. [QUERY] Aggregation
    const [rows] = await pool.query(
      'SELECT SUM(amount) as total FROM rent_invoices WHERE lease_id = ? AND status = ?',
      [leaseId, 'pending']
    );
    return rows[0].total || 0;
  }

  // MAP ROW: Data transfer object (DTO) transformer for camelCase consistency.
  mapRow(row) {
    if (!row) return null;
    return {
      id: row.invoice_id?.toString(),
      leaseId: row.lease_id?.toString(),
      year: row.year,
      month: row.month,
      amount: roundToCents(row.amount),
      amountPaid: roundToCents(row.amount_paid || 0),
      dueDate: row.due_date,
      status: row.status,
      invoiceType: row.invoice_type,
      description: row.description,
      createdAt: row.created_at,
      tenantId: row.tenant_id?.toString(),
      unitId: row.unit_id?.toString(),
      tenantName: row.tenant_name,
      propertyName: row.property_name,
      unitNumber: row.unit_number,
      unitStatus: row.unit_status,
      lateFeePercentage: row.late_fee_percentage
        ? parseFloat(row.late_fee_percentage)
        : null,
      lateFeeGracePeriod: row.late_fee_grace_period
        ? parseInt(row.late_fee_grace_period)
        : null,
      lastOrderId: row.last_order_id,
    };
  }

  // FIND BY ID FOR UPDATE: Atomic Retrieval with SELECT ... FOR UPDATE row locking.
  async findByIdForUpdate(id, connection) {
    if (!connection)
      throw new Error(
        'findByIdForUpdate requires an active transaction connection.'
      );

    // 1. [QUERY] Locked Retrieval: Prevents concurrent payment processing race conditions
    const [rows] = await connection.query(
      `SELECT ri.*, u.property_id, l.unit_id 
       FROM rent_invoices ri 
       JOIN leases l ON ri.lease_id = l.lease_id
       JOIN units u ON l.unit_id = u.unit_id
       WHERE ri.invoice_id = ? FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  // FIND BY ID: Fetch an invoice by its unique key.
  async findById(id, connection = null) {
    const db = connection || pool;
    // 1. [QUERY] Joined Retrieval
    const [rows] = await db.query(
      `SELECT ri.*, l.tenant_id FROM rent_invoices ri 
       JOIN leases l ON ri.lease_id = l.lease_id WHERE ri.invoice_id = ?`,
      [id]
    );
    return this.mapRow(rows[0]);
  }

  // FIND BY MAGIC TOKEN: Authenticates a tenant for a public "Pay Now" link.
  async findByMagicToken(rawToken, connection = null) {
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const db = connection || pool;

    // 1. [QUERY] Complex Resolution: Authenticates valid tokens that haven't expired or are still unpaid
    const [rows] = await db.query(
      `SELECT ri.*, l.tenant_id, l.unit_id,
              u.name as tenant_name, p.name as property_name, un.unit_number, un.status as unit_status
       FROM rent_invoices ri 
       JOIN leases l ON ri.lease_id = l.lease_id 
       JOIN users u ON l.tenant_id = u.user_id
       JOIN units un ON l.unit_id = un.unit_id
       JOIN properties p ON un.property_id = p.property_id
       WHERE ri.magic_token_hash = ? 
       AND l.status IN ('draft', 'pending')
       AND (ri.magic_token_expires_at IS NULL OR ri.magic_token_expires_at > NOW())`,
      [hash]
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  // CLEAR MAGIC TOKEN: Invalidates an invitation link after use or security trigger.
  async clearMagicToken(invoiceId, connection = null) {
    const db = connection || pool;
    await db.query(
      'UPDATE rent_invoices SET magic_token_hash = NULL, magic_token_expires_at = NULL WHERE invoice_id = ?',
      [invoiceId]
    );
  }

  // UPDATE LAST ORDER ID: Caches a payment gateway session ID to track pending attempts.
  async updateLastOrderId(invoiceId, orderId, connection = null) {
    const db = connection || pool;
    await db.query(
      'UPDATE rent_invoices SET last_order_id = ? WHERE invoice_id = ?',
      [orderId, invoiceId]
    );
  }

  // FIND BY ORDER ID: Resolves an invoice from a gateway notification payload.
  async findByOrderId(orderId, connection = null) {
    const db = connection || pool;
    // 1. [QUERY] Data Mapping
    const [rows] = await db.query(
      `SELECT ri.*, l.tenant_id, l.unit_id,
              u.name as tenant_name, p.name as property_name, un.unit_number, un.status as unit_status
       FROM rent_invoices ri 
       JOIN leases l ON ri.lease_id = l.lease_id 
       JOIN users u ON l.tenant_id = u.user_id
       JOIN units un ON l.unit_id = un.unit_id
       JOIN properties p ON un.property_id = p.property_id
       WHERE ri.last_order_id = ?`,
      [orderId]
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  // FIND BY TENANT ID: Lists the billing history for a specific inhabitant.
  async findByTenantId(tenantId) {
    // 1. [QUERY] Filtered Retrieval
    const [rows] = await pool.query(
      `SELECT ri.*, l.tenant_id, l.unit_id, u.name as tenant_name, p.name as property_name, un.unit_number
       FROM rent_invoices ri
       JOIN leases l ON ri.lease_id = l.lease_id
       JOIN users u ON l.tenant_id = u.user_id
       JOIN units un ON l.unit_id = un.unit_id
       JOIN properties p ON un.property_id = p.property_id
       WHERE l.tenant_id = ? ORDER BY ri.due_date ASC`,
      [tenantId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // FIND ALL: System-wide billing registry (Admin/Super-Owner view).
  async findAll() {
    const [rows] = await pool.query(`
            SELECT ri.*, l.tenant_id, l.unit_id, u.name as tenant_name, p.name as property_name, un.unit_number
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN users u ON l.tenant_id = u.user_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN properties p ON un.property_id = p.property_id
            ORDER BY ri.due_date DESC
        `);
    return rows.map((row) => this.mapRow(row));
  }

  // FIND BY OWNER ID: Lists all bills within an Owner's entire portfolio.
  async findByOwnerId(ownerId) {
    const [rows] = await pool.query(
      `SELECT ri.*, l.tenant_id, l.unit_id, u.name as tenant_name, p.name as property_name, un.unit_number
       FROM rent_invoices ri
       JOIN leases l ON ri.lease_id = l.lease_id
       JOIN users u ON l.tenant_id = u.user_id
       JOIN units un ON l.unit_id = un.unit_id
       JOIN properties p ON un.property_id = p.property_id
       WHERE p.owner_id = ? ORDER BY ri.due_date DESC`,
      [ownerId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // FIND BY TREASURER ID: Limits billing view to properties explicitly assigned to the staff member.
  async findByTreasurerId(treasurerId) {
    const [rows] = await pool.query(
      `SELECT ri.*, l.tenant_id, l.unit_id, u.name as tenant_name, p.name as property_name, un.unit_number
       FROM rent_invoices ri
       JOIN leases l ON ri.lease_id = l.lease_id
       JOIN users u ON l.tenant_id = u.user_id
       JOIN units un ON l.unit_id = un.unit_id
       JOIN properties p ON un.property_id = p.property_id
       JOIN staff_property_assignments spa ON p.property_id = spa.property_id
       WHERE spa.user_id = ? ORDER BY ri.due_date DESC`,
      [treasurerId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // UPDATE STATUS: Moves a bill through its lifecycle (Pending -> Paid/Void/Partially Paid).
  async updateStatus(id, status, connection = null) {
    const db = connection || pool;
    // 1. [DATA] State Persistence
    await db.query('UPDATE rent_invoices SET status = ? WHERE invoice_id = ?', [
      status,
      id,
    ]);
    return this.findById(id, db);
  }

  // CREATE LATE FEE INVOICE: Specialized factory for penalty charges.
  async createLateFeeInvoice(data, connection = null) {
    return await this.create({ ...data, type: 'late_fee' }, connection);
  }

  // FIND OVERDUE: Identifies bills that have passed their grace period date.
  async findOverdue() {
    // 1. [QUERY] Filtered Aggregation: Calculates overdue status based on per-property grace period settings
    const [rows] = await pool.query(
      `SELECT ri.*, l.tenant_id, p.late_fee_percentage, p.late_fee_type, p.late_fee_amount, p.late_fee_grace_period
       FROM rent_invoices ri
       JOIN leases l ON ri.lease_id = l.lease_id
       JOIN units un ON l.unit_id = un.unit_id
       JOIN properties p ON un.property_id = p.property_id
       WHERE ri.status IN ('pending', 'partially_paid')
       AND ri.due_date < DATE_SUB(CURDATE(), INTERVAL p.late_fee_grace_period DAY)`
    );
    return rows.map((row) => this.mapRow(row));
  }

  // FIND BY LEASE AND DESCRIPTION: Search utility for specific historical adjustments.
  async findByLeaseAndDescription(leaseId, description) {
    const [rows] = await pool.query(
      'SELECT * FROM rent_invoices WHERE lease_id = ? AND description LIKE ?',
      [leaseId, `%${description}%`]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // SYNC FUTURE RENT INVOICES: Propagates a base rent change to all upcoming billing cycles.
  async syncFutureRentInvoices(
    leaseId,
    newAmount,
    fromDate,
    connection = null
  ) {
    const db = connection || pool;
    // 1. [DATA] Bulk Update
    await db.query(
      `UPDATE rent_invoices SET amount = ?, description = CONCAT(description, ' (Rent Adjusted)')
       WHERE lease_id = ? AND status = 'pending' AND invoice_type = 'rent' AND due_date > ?`,
      [newAmount, leaseId, fromDate]
    );
  }

  // VOID PENDING BY LEASE ID: Cancels all liabilities for a terminated lease.
  async voidPendingByLeaseId(leaseId, connection = null) {
    const db = connection || pool;
    await db.query(
      "UPDATE rent_invoices SET status='void' WHERE lease_id = ? AND status='pending'",
      [leaseId]
    );
  }

  // VOID FUTURE PENDING BY LEASE ID: Truncates billing schedule after a specific move-out date.
  async voidFuturePendingByLeaseId(leaseId, date, connection = null) {
    const db = connection || pool;
    await db.query(
      "UPDATE rent_invoices SET status='void' WHERE lease_id = ? AND status='pending' AND due_date > ?",
      [leaseId, date]
    );
  }

  // VOID ALL PENDING BY LEASE ID: Aggressive cleanup for legal or administrative overrides.
  async voidAllPendingByLeaseId(leaseId, connection = null) {
    const db = connection || pool;
    await db.query(
      "UPDATE rent_invoices SET status='void' WHERE lease_id = ? AND status IN ('pending', 'partially_paid')",
      [leaseId]
    );
  }

  // FIND PENDING DEBTS: Lists unpaid balances in chronological order for payment allocation.
  async findPendingDebts(leaseId, connection = null) {
    const db = connection || pool;
    const [rows] = await db.query(
      `SELECT ri.* FROM rent_invoices ri
       WHERE ri.lease_id = ? AND ri.status IN ('pending', 'partially_paid') ORDER BY ri.due_date ASC`,
      [leaseId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // ANALYTICS STATS: High-performance aggregation for property-level income reports.
  async getFinancialStats(year, startDate = null, endDate = null) {
    let query = `
      SELECT p.property_id, p.name AS property_name, SUM(ri.amount) AS total_income
      FROM rent_invoices ri
      JOIN leases l ON ri.lease_id = l.lease_id
      JOIN units un ON l.unit_id = un.unit_id
      JOIN properties p ON un.property_id = p.property_id
      WHERE ri.status = 'paid'
    `;
    const params = [];

    // 1. [QUERY] Filter Application
    if (startDate && endDate) {
      query += ` AND ri.due_date BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else {
      query += ` AND YEAR(ri.due_date) = ?`;
      params.push(year);
    }

    query += ` GROUP BY p.property_id, p.name`;

    // 2. [DATA] Collection
    const [rows] = await pool.query(query, params);
    return rows.map((row) => ({
      propertyId: row.property_id,
      propertyName: row.property_name,
      totalIncome: Number(row.total_income || 0),
    }));
  }
}

export default new InvoiceModel();
