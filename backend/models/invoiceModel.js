// ============================================================================
//  INVOICE MODEL (The Bill Records)
// ============================================================================
//  This file keeps track of every bill we've ever sent.
//  It records who owes money, how much, and for what (Rent, Maintenance).
// ============================================================================

import pool from '../config/db.js';

class InvoiceModel {
  //  CREATE: Writing a new bill to the ledger.
  // NOTE: Email notifications are handled by the caller (service/controller/cron layer).
  async create(data, connection = null) {
    const { leaseId, amount, dueDate, description, type } = data;
    // Need to determine year/month from dueDate
    const date = new Date(dueDate);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12

    const db = connection || pool;
    try {
      const [result] = await db.query(
        'INSERT INTO rent_invoices (lease_id, year, month, amount, due_date, status, invoice_type, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [leaseId, year, month, amount, dueDate, 'pending', type, description]
      );
      const invoiceId = result.insertId;

      // [NEW] Post to Ledger (Debit Revenue/Liability to track accrual/debt)
      if (invoiceId) {
        try {
          const ledgerModel = (await import('./ledgerModel.js')).default;
          // Use dynamic import to avoid potential circular dependencies
          
          const accountType = type === 'deposit' ? 'liability' : 'revenue';
          const category = type === 'deposit' ? 'deposit_accrued' : (type || 'rent');

          await ledgerModel.create({
            invoiceId,
            leaseId,
            accountType,
            category,
            debit: Number(amount),
            description: `Generated ${type || 'rent'} invoice: ${description || 'No description'}`,
            entryDate: new Date().toISOString().split('T')[0],
          }, db);
        } catch (ledgerErr) {
          console.error('Failed to post initial ledger entry for invoice:', ledgerErr);
        }
      }

      return invoiceId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        console.warn(`Duplicate invoice detected: Lease ${leaseId}, Period ${year}-${month}, Type ${type}`);
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

  async findById(id) {
    // Join with leases to get tenant_id for scoring hooks
    const [rows] = await pool.query(
      `
            SELECT ri.*, l.tenant_id,
                   COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = ri.invoice_id AND status = 'verified'), 0) AS amount_paid
            FROM rent_invoices ri 
            JOIN leases l ON ri.lease_id = l.lease_id 
            WHERE ri.invoice_id = ?
        `,
      [id]
    );
    return rows[0];
  }

  async findByTenantId(tenantId) {
    const [rows] = await pool.query(
      `
            SELECT ri.*, l.tenant_id, l.unit_id,
                   COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = ri.invoice_id AND status = 'verified'), 0) AS amount_paid
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            WHERE l.tenant_id = ? 
            ORDER BY ri.due_date ASC
        `,
      [tenantId]
    );
    return rows;
  }

  async findAll() {
    const [rows] = await pool.query(`
            SELECT ri.*, l.tenant_id, l.unit_id, u.name as tenant_name, p.name as property_name, un.unit_number,
                   COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = ri.invoice_id AND status = 'verified'), 0) AS amount_paid
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN users u ON l.tenant_id = u.user_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN properties p ON un.property_id = p.property_id
            ORDER BY ri.due_date DESC
        `);
    return rows;
  }

  async findByOwnerId(ownerId) {
    const [rows] = await pool.query(
      `
            SELECT ri.*, l.tenant_id, l.unit_id, u.name as tenant_name, p.name as property_name, un.unit_number,
                   COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = ri.invoice_id AND status = 'verified'), 0) AS amount_paid
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
    return rows;
  }

  async findByTreasurerId(treasurerId) {
    const [rows] = await pool.query(
      `
            SELECT ri.*, l.tenant_id, l.unit_id, u.name as tenant_name, p.name as property_name, un.unit_number,
                   COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = ri.invoice_id AND status = 'verified'), 0) AS amount_paid
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
    return rows;
  }

  async updateStatus(id, status) {
    await pool.query(
      'UPDATE rent_invoices SET status = ? WHERE invoice_id = ?',
      [status, id]
    );
    return this.findById(id);
  }

  async createLateFeeInvoice(data) {
    return await this.create({
      ...data,
      type: 'late_fee',
    });
  }

  async findOverdue(gracePeriodDays = 5) {
    // Find Pending invoices where due_date < (today - gracePeriodDays)
    // AND description NOT LIKE 'Late Fee%' (to avoid compounding late fees on late fees?)
    // Fix 1: Use Invoice Amount, not Lease Rent (Handles rent changes correctly)
    // const [rows] = await pool.query(`SELECT ri.*, l.monthly_rent...`) -> ri.amount is what we want.
    const [rows] = await pool.query(
      `
            SELECT ri.*, l.tenant_id,
                   COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = ri.invoice_id AND status = 'verified'), 0) AS amount_paid
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            WHERE ri.status IN ('pending', 'partially_paid')
            AND ri.due_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)
            AND NOT EXISTS (
                SELECT 1 FROM rent_invoices ri2 
                WHERE ri2.lease_id = ri.lease_id 
                AND ri2.description LIKE CONCAT('%Invoice #', ri.invoice_id, '%')
            )
        `,
      [gracePeriodDays]
    );
    return rows;
  }

  async findByLeaseAndDescription(leaseId, description) {
    const [rows] = await pool.query(
      'SELECT * FROM rent_invoices WHERE lease_id = ? AND description LIKE ?',
      [leaseId, `%${description}%`]
    );
    return rows;
  }
  async syncFutureRentInvoices(leaseId, newAmount, fromDate) {
    await pool.query(
      `UPDATE rent_invoices 
             SET amount = ?, description = CONCAT(description, ' (Rent Adjusted)')
             WHERE lease_id = ? 
             AND status = 'pending' 
             AND invoice_type = 'rent'
             AND due_date > ?`,
      [newAmount, leaseId, fromDate]
    );
  }

  async voidPendingByLeaseId(leaseId) {
    await pool.query(
      "UPDATE rent_invoices SET status='void' WHERE lease_id = ? AND status='pending'",
      [leaseId]
    );
  }

  async voidFuturePendingByLeaseId(leaseId, date) {
    await pool.query(
      "UPDATE rent_invoices SET status='void' WHERE lease_id = ? AND status='pending' AND due_date > ?",
      [leaseId, date]
    );
  }
  async findPendingDebts(leaseId) {
    const [rows] = await pool.query(
      `SELECT *, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = rent_invoices.invoice_id AND status = 'verified'), 0) AS amount_paid FROM rent_invoices WHERE lease_id = ? AND status IN ('pending', 'partially_paid') ORDER BY due_date ASC`,
      [leaseId]
    );
    return rows;
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
    return rows;
  }
}

export default new InvoiceModel();
