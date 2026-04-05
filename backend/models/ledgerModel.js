// ============================================================================
//  LEDGER MODEL (The Accounting Books)
// ============================================================================
//  This file manages the double-entry accounting ledger.
//  Every verified payment creates a ledger entry classified as
//  revenue, liability, or expense.
// ============================================================================

import pool from '../config/db.js';

class LedgerModel {
  /**
   * Create a new ledger entry.
   * @param {Object} data - { paymentId, invoiceId, leaseId, accountType, category, debit, credit, description, entryDate }
   * @param {Object} [connection] - Optional DB connection for transactions
   */
  async create(data, connection = null) {
    const {
      paymentId = null,
      invoiceId = null,
      leaseId,
      accountType,
      category,
      debit = 0,
      credit = 0,
      description,
      entryDate,
    } = data;

    const db = connection || pool;
    try {
      const [result] = await db.query(
        `INSERT INTO accounting_ledger 
         (payment_id, invoice_id, lease_id, account_type, category, debit, credit, description, entry_date) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentId, invoiceId, leaseId, accountType, category, debit, credit, description, entryDate]
      );
      return result.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        // Silently ignore or log warning for double-posting in ledger if it's the exact same entry.
        // Usually, double-posting is an error, but we want the outer transaction to succeed if possible or handle it.
        // For audit trail, let's log but don't strictly crash if it's already recorded.
        console.warn('Attempted to double-post to ledger:', description);
        return null; 
      }
      throw err;
    }
  }

  mapRow(row) {
    if (!row) return null;
    return {
      id: row.entry_id.toString(),
      paymentId: row.payment_id ? row.payment_id.toString() : null,
      invoiceId: row.invoice_id ? row.invoice_id.toString() : null,
      leaseId: row.lease_id.toString(),
      accountType: row.account_type,
      category: row.category,
      debit: Number(row.debit),
      credit: Number(row.credit),
      description: row.description,
      entryDate: row.entry_date
    };
  }

  /**
   * Get all ledger entries for a specific lease.
   */
  async findByLeaseId(leaseId) {
    const [rows] = await pool.query(
      `SELECT * FROM accounting_ledger WHERE lease_id = ? ORDER BY entry_date DESC, entry_id DESC`,
      [leaseId]
    );
    return rows.map(row => this.mapRow(row));
  }

  /**
   * Get aggregated financial summary per property for a given year.
   * Returns: { propertyName: { revenue, liability, expense } }
   */
  async getSummaryByProperty(propertyIds, year) {
    if (!propertyIds || propertyIds.length === 0) return {};

    const [rows] = await pool.query(
      `SELECT 
         p.name AS property_name,
         al.account_type,
         SUM(al.credit) AS total_credit,
         SUM(al.debit) AS total_debit
       FROM accounting_ledger al
       JOIN leases l ON al.lease_id = l.lease_id
       JOIN units u ON l.unit_id = u.unit_id
       JOIN properties p ON u.property_id = p.property_id
       WHERE p.property_id IN (?)
       AND YEAR(al.entry_date) = ?
       GROUP BY p.name, al.account_type`,
      [propertyIds, year]
    );

    const summary = {};

    rows.forEach((row) => {
      const name = row.property_name;
      if (!summary[name]) {
        summary[name] = {
          revenue: 0,          // Collected (Credits)
          revenueEarned: 0,    // Invoiced (Debits)
          liabilityHeld: 0,
          liabilityRefunded: 0,
          expense: 0,
        };
      }

      if (row.account_type === 'revenue') {
        summary[name].revenue += Number(row.total_credit);
        summary[name].revenueEarned += Number(row.total_debit);
      } else if (row.account_type === 'liability') {
        // Credits increase liability (deposit received)
        // Debits decrease liability (deposit refunded)
        summary[name].liabilityHeld += Number(row.total_credit);
        summary[name].liabilityRefunded += Number(row.total_debit);
      } else if (row.account_type === 'expense') {
        // Expenses increase with credit (in our payments-are-credits logic?)
        // Actually paymentService.js Case 'maintenance' -> Account 'expense', Credit: amount.
        // So Expenses are Credits.
        summary[name].expense += Number(row.total_credit) - Number(row.total_debit);
      }
    });

    return summary;
  }

  /**
   * Get a full ledger summary for a given year (totals only).
   */
  async getYearlySummary(propertyIds, year) {
    if (!propertyIds || propertyIds.length === 0) {
      return { totalRevenue: 0, totalLiabilityHeld: 0, totalLiabilityRefunded: 0, totalExpense: 0, netOperatingIncome: 0 };
    }

    const [rows] = await pool.query(
      `SELECT 
         al.account_type,
         al.category,
         SUM(al.credit) AS total_credit,
         SUM(al.debit) AS total_debit
       FROM accounting_ledger al
       JOIN leases l ON al.lease_id = l.lease_id
       JOIN units u ON l.unit_id = u.unit_id
       JOIN properties p ON u.property_id = p.property_id
       WHERE p.property_id IN (?)
       AND YEAR(al.entry_date) = ?
       GROUP BY al.account_type, al.category`,
      [propertyIds, year]
    );

    let totalRevenueCollected = 0;
    let totalRevenueEarned = 0;
    let totalLiabilityHeld = 0;
    let totalLiabilityRefunded = 0;
    let totalExpense = 0;

    rows.forEach((row) => {
      const credit = Number(row.total_credit);
      const debit = Number(row.total_debit);

      if (row.account_type === 'revenue') {
        totalRevenueCollected += credit;
        totalRevenueEarned += debit;
      } else if (row.account_type === 'liability') {
        totalLiabilityHeld += credit;
        totalLiabilityRefunded += debit;
      } else if (row.account_type === 'expense') {
        totalExpense += credit - debit;
      }
    });

    return {
      totalRevenue: totalRevenueCollected,
      totalRevenueEarned,
      totalRevenueCollected,
      totalLiabilityHeld,
      totalLiabilityRefunded,
      netLiability: totalLiabilityHeld - totalLiabilityRefunded,
      totalExpense,
      netOperatingIncome: totalRevenueCollected - totalExpense,
    };
  }

  /**
   * Get monthly aggregated totals for the last N months.
   * Returns: [ { month: '2025-01', revenue: 100, expense: 50 }, ... ]
   */
  async getMonthlyStats(propertyIds, monthsLimit = 12) {
    if (!propertyIds || propertyIds.length === 0) return [];

    const [rows] = await pool.query(
      `SELECT 
         DATE_FORMAT(al.entry_date, '%Y-%m') AS month_label,
         al.account_type,
         SUM(al.credit) AS total_credit,
         SUM(al.debit) AS total_debit
       FROM accounting_ledger al
       JOIN leases l ON al.lease_id = l.lease_id
       JOIN units u ON l.unit_id = u.unit_id
       WHERE u.property_id IN (?)
       AND al.entry_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY month_label, al.account_type
       ORDER BY month_label ASC`,
      [propertyIds, monthsLimit]
    );

    const monthlyData = {};

    rows.forEach((row) => {
      const month = row.month_label;
      if (!monthlyData[month]) {
        monthlyData[month] = { month, revenue: 0, expense: 0 };
      }

      if (row.account_type === 'revenue') {
        monthlyData[month].revenue += Number(row.total_credit);
      } else if (row.account_type === 'expense') {
        monthlyData[month].expense += Number(row.total_credit) - Number(row.total_debit);
      }
    });

    return Object.values(monthlyData);
  }

  /**
   * Internal Audit Tool: Finds verified payments that don't have a corresponding ledger entry.
   */
  async findMismatches() {
    // 1. Find verified payments without ledger entries (Credits)
    const [payments] = await pool.query(`
        SELECT p.payment_id, p.amount, p.invoice_id, p.status, 'payment' as record_type
        FROM payments p
        LEFT JOIN accounting_ledger al ON p.payment_id = al.payment_id
        WHERE p.status = 'verified' AND al.entry_id IS NULL
    `);

    // 2. Find invoices without ledger entries (Debits)
    const [invoices] = await pool.query(`
        SELECT ri.invoice_id, ri.amount, ri.lease_id, ri.status, 'invoice' as record_type
        FROM rent_invoices ri
        LEFT JOIN accounting_ledger al ON ri.invoice_id = al.invoice_id
        WHERE ri.status NOT IN ('void') AND al.entry_id IS NULL
    `);

    return [...payments, ...invoices];
  }
}

export default new LedgerModel();
