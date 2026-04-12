// ============================================================================
//  INVOICE MODEL (The Bill Records)
// ============================================================================
//  This file keeps track of every bill we've ever sent.
//  It records who owes money, how much, and for what (Rent, Maintenance).
// ============================================================================

import pool from '../config/db.js';
import { getCurrentDateString, parseLocalDate } from '../utils/dateUtils.js';
import { fromCents } from '../utils/moneyUtils.js';

class InvoiceModel {
  //  CREATE: Writing a new bill to the ledger.
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
    // Need to determine year/month from dueDate if not explicitly provided
    const date = parseLocalDate(dueDate);
    const year = data.year || date.getFullYear();
    const month = data.month || date.getMonth() + 1; // 1-12

    const db = connection || pool;
    try {
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

      // [NEW] Post to Ledger (Debit Revenue/Liability to track accrual/debt)
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
              debit: Number(amount),
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
      if (error.code === 'ER_DUP_ENTRY') {
        console.warn(
          `Duplicate invoice detected: Lease ${leaseId}, Period ${year}-${month}, Type ${type}`
        );
        return null; // Signals that creation was skipped due to existing record
      }
      throw error;
    }
  }

  async exists(leaseId, year, month, type = null, connection = null) {
    let query =
      'SELECT invoice_id FROM rent_invoices WHERE lease_id = ? AND year = ? AND month = ?';
    const params = [leaseId, year, month];

    if (type) {
      query += ' AND invoice_type = ?';
      params.push(type);
    }

    const db = connection || pool;
    const [rows] = await db.query(query, params);
    return rows.length > 0;
  }

  async getPendingTotal(leaseId) {
    const [rows] = await pool.query(
      'SELECT SUM(amount) as total FROM rent_invoices WHERE lease_id = ? AND status = ?',
      [leaseId, 'pending']
    );
    return rows[0].total || 0;
  }

  mapRow(row) {
    if (!row) return null;
    return {
      id: row.invoice_id?.toString(),
      leaseId: row.lease_id?.toString(),
      year: row.year,
      month: row.month,
      amount: Number(row.amount),
      amountPaid: Number(row.amount_paid || 0),
      dueDate: row.due_date,
      status: row.status,
      invoiceType: row.invoice_type,
      description: row.description,
      createdAt: row.created_at,
      // Joined fields
      tenantId: row.tenant_id?.toString(),
      unitId: row.unit_id?.toString(),
      tenantName: row.tenant_name,
      propertyName: row.property_name,
      unitNumber: row.unit_number,
      unitStatus: row.unit_status,
      // Late Fee Config (if joined)
      lateFeePercentage: row.late_fee_percentage
        ? parseFloat(row.late_fee_percentage)
        : null,
      lateFeeGracePeriod: row.late_fee_grace_period
        ? parseInt(row.late_fee_grace_period)
        : null,
      lastOrderId: row.last_order_id,
    };
  }

  /**
   * [NEW] Atomic Retrieval with Row Locking.
   * Use this to serialize concurrent payment gateway notifications.
   */
  async findByIdForUpdate(id, connection) {
    if (!connection)
      throw new Error(
        'findByIdForUpdate requires an active transaction connection.'
      );
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

  async findById(id, connection = null) {
    const db = connection || pool;
    const [rows] = await db.query(
      `
            SELECT ri.*, l.tenant_id
            FROM rent_invoices ri 
            JOIN leases l ON ri.lease_id = l.lease_id 
            WHERE ri.invoice_id = ?
        `,
      [id]
    );
    return this.mapRow(rows[0]);
  }

  async findByMagicToken(rawToken, connection = null) {
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const db = connection || pool;
    const [rows] = await db.query(
      `
             SELECT ri.*, l.tenant_id, l.unit_id,
                    p.name as property_name, un.unit_number, un.status as unit_status
             FROM rent_invoices ri 
             JOIN leases l ON ri.lease_id = l.lease_id 
             JOIN units un ON l.unit_id = un.unit_id
             JOIN properties p ON un.property_id = p.property_id
             WHERE ri.magic_token_hash = ? 
             AND (
               ri.magic_token_expires_at IS NULL 
               OR ri.magic_token_expires_at > NOW() 
               OR ri.status != 'pending'
               OR EXISTS (SELECT 1 FROM payments pay WHERE pay.invoice_id = ri.invoice_id)
             )
         `,
      [hash]
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async clearMagicToken(invoiceId, connection = null) {
    const db = connection || pool;
    await db.query(
      'UPDATE rent_invoices SET magic_token_hash = NULL, magic_token_expires_at = NULL WHERE invoice_id = ?',
      [invoiceId]
    );
  }

  async updateLastOrderId(invoiceId, orderId, connection = null) {
    const db = connection || pool;
    await db.query(
      'UPDATE rent_invoices SET last_order_id = ? WHERE invoice_id = ?',
      [orderId, invoiceId]
    );
  }

  async findByOrderId(orderId, connection = null) {
    const db = connection || pool;
    const [rows] = await db.query(
      `
              SELECT ri.*, l.tenant_id, l.unit_id,
                     p.name as property_name, un.unit_number, un.status as unit_status
              FROM rent_invoices ri 
              JOIN leases l ON ri.lease_id = l.lease_id 
              JOIN units un ON l.unit_id = un.unit_id
              JOIN properties p ON un.property_id = p.property_id
              WHERE ri.last_order_id = ?
          `,
      [orderId]
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async findByTenantId(tenantId) {
    const [rows] = await pool.query(
      `
            SELECT ri.*, l.tenant_id, l.unit_id
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            WHERE l.tenant_id = ? 
            ORDER BY ri.due_date ASC
        `,
      [tenantId]
    );
    return rows.map((row) => this.mapRow(row));
  }

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

  async findByOwnerId(ownerId) {
    const [rows] = await pool.query(
      `
            SELECT ri.*, l.tenant_id, l.unit_id, u.name as tenant_name, p.name as property_name, un.unit_number
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN users u ON l.tenant_id = u.user_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN properties p ON un.property_id = p.property_id
            WHERE p.owner_id = ?
            ORDER BY ri.due_date DESC
        `,
      [ownerId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  async findByTreasurerId(treasurerId) {
    const [rows] = await pool.query(
      `
            SELECT ri.*, l.tenant_id, l.unit_id, u.name as tenant_name, p.name as property_name, un.unit_number
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN users u ON l.tenant_id = u.user_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN properties p ON un.property_id = p.property_id
            JOIN staff_property_assignments spa ON p.property_id = spa.property_id
            WHERE spa.user_id = ?
            ORDER BY ri.due_date DESC
        `,
      [treasurerId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  async updateStatus(id, status, connection = null) {
    const db = connection || pool;
    await db.query('UPDATE rent_invoices SET status = ? WHERE invoice_id = ?', [
      status,
      id,
    ]);
    return this.findById(id, db);
  }

  async createLateFeeInvoice(data, connection = null) {
    return await this.create(
      {
        ...data,
        type: 'late_fee',
      },
      connection
    );
  }

  async findOverdue() {
    const [rows] = await pool.query(
      `
            SELECT ri.*, l.tenant_id, p.late_fee_percentage, p.late_fee_type, p.late_fee_amount, p.late_fee_grace_period
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN properties p ON un.property_id = p.property_id
            WHERE ri.status IN ('pending', 'partially_paid')
            AND ri.due_date < DATE_SUB(CURDATE(), INTERVAL p.late_fee_grace_period DAY)
        `
    );
    return rows.map((row) => this.mapRow(row));
  }

  async findByLeaseAndDescription(leaseId, description) {
    const [rows] = await pool.query(
      'SELECT * FROM rent_invoices WHERE lease_id = ? AND description LIKE ?',
      [leaseId, `%${description}%`]
    );
    return rows.map((row) => this.mapRow(row));
  }
  async syncFutureRentInvoices(
    leaseId,
    newAmount,
    fromDate,
    connection = null
  ) {
    const db = connection || pool;
    await db.query(
      `UPDATE rent_invoices 
             SET amount = ?, description = CONCAT(description, ' (Rent Adjusted)')
             WHERE lease_id = ? 
             AND status = 'pending' 
             AND invoice_type = 'rent'
             AND due_date > ?`,
      [newAmount, leaseId, fromDate]
    );
  }

  async voidPendingByLeaseId(leaseId, connection = null) {
    const db = connection || pool;
    await db.query(
      "UPDATE rent_invoices SET status='void' WHERE lease_id = ? AND status='pending'",
      [leaseId]
    );
  }

  async voidFuturePendingByLeaseId(leaseId, date, connection = null) {
    const db = connection || pool;
    await db.query(
      "UPDATE rent_invoices SET status='void' WHERE lease_id = ? AND status='pending' AND due_date > ?",
      [leaseId, date]
    );
  }
  async findPendingDebts(leaseId, connection = null) {
    const db = connection || pool;
    const [rows] = await db.query(
      `SELECT ri.* 
       FROM rent_invoices ri
       WHERE ri.lease_id = ? AND ri.status IN ('pending', 'partially_paid') ORDER BY ri.due_date ASC`,
      [leaseId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // Analytics optimized query to avoid O(N) memory buildup
  async getFinancialStatsByYear(year) {
    const [rows] = await pool.query(
      `
      SELECT p.name AS property_name, SUM(ri.amount) AS total_income
      FROM rent_invoices ri
      JOIN leases l ON ri.lease_id = l.lease_id
      JOIN units un ON l.unit_id = un.unit_id
      JOIN properties p ON un.property_id = p.property_id
      WHERE ri.status = 'paid' AND YEAR(ri.due_date) = ?
      GROUP BY p.property_id
      `,
      [year]
    );
    return rows.map((row) => ({
      propertyName: row.property_name,
      totalIncome: fromCents(row.total_income || 0),
    }));
  }
}

export default new InvoiceModel();
