// ============================================================================
//  LEDGER MODEL (The Accounting Books)
// ============================================================================
//  This file manages the double-entry accounting ledger.
//  Every verified payment creates a ledger entry classified as
//  revenue, liability, or expense.
// ============================================================================

import pool from '../config/db.js';

class LedgerModel {
  // CREATE: Records a new double-entry record into the financial foundation.
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
      // 1. [DATA] Persistence: Insert the entry into the primary audit table
      const [result] = await db.query(
        `INSERT INTO accounting_ledger 
         (payment_id, invoice_id, lease_id, account_type, category, debit, credit, description, entry_date) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          paymentId,
          invoiceId,
          leaseId,
          accountType,
          category,
          debit,
          credit,
          description,
          entryDate,
        ]
      );
      return result.insertId;
    } catch (err) {
      // 2. [INTEGRITY] Duplicate Guard: Prevent double-posting for the same logical event
      if (err.code === 'ER_DUP_ENTRY') {
        console.warn('Attempted to double-post to ledger:', description);
        return null;
      }
      throw err;
    }
  }

  // MAP ROW: Data transfer object (DTO) transformer for camelCase consistency.
  mapRow(row) {
    if (!row) return null;
    return {
      id: row.entry_id.toString(),
      paymentId: row.payment_id ? row.payment_id.toString() : null,
      invoiceId: row.invoice_id ? row.invoice_id.toString() : null,
      leaseId: row.lease_id.toString(),
      accountType: row.account_type,
      category: row.category,
      debit: row.debit,
      credit: row.credit,
      description: row.description,
      entryDate: row.entry_date,
    };
  }

  // FIND BY LEASE ID: Lists the full financial history for a specific contract.
  async findByLeaseId(leaseId) {
    // 1. [QUERY] Extraction
    const [rows] = await pool.query(
      `SELECT * FROM accounting_ledger WHERE lease_id = ? ORDER BY entry_date DESC, entry_id DESC`,
      [leaseId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  // GET SUMMARY BY PROPERTY: Categorizes income and debt for property-level reporting.
  async getSummaryByProperty(
    propertyIds,
    year,
    startDate = null,
    endDate = null
  ) {
    if (!propertyIds || propertyIds.length === 0) return {};

    // 1. [QUERY] Aggregation: Joins ledger entries to properties through units and leases
    let query = `SELECT 
         p.name AS property_name,
         al.account_type,
         SUM(al.credit) AS total_credit,
         SUM(al.debit) AS total_debit
       FROM accounting_ledger al
       JOIN leases l ON al.lease_id = l.lease_id
       JOIN units u ON l.unit_id = u.unit_id
       JOIN properties p ON u.property_id = p.property_id
       WHERE p.property_id IN (?)`;

    const params = [propertyIds];

    if (startDate && endDate) {
      query += ` AND al.entry_date BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else {
      query += ` AND YEAR(al.entry_date) = ?`;
      params.push(year);
    }

    query += ` GROUP BY p.name, al.account_type`;

    const [rows] = await pool.query(query, params);
    const summary = {};

    // 2. [TRANSFORMATION] Data Categorization: Distributes totals into revenue, liability, and expense buckets
    rows.forEach((row) => {
      const name = row.property_name;
      if (!summary[name]) {
        summary[name] = {
          revenue: 0,
          revenueEarned: 0,
          liabilityHeld: 0,
          liabilityRefunded: 0,
          expense: 0,
        };
      }

      if (row.account_type === 'revenue') {
        summary[name].revenue += Number(row.total_credit);
        summary[name].revenueEarned += Number(row.total_debit);
      } else if (row.account_type === 'liability') {
        summary[name].liabilityHeld += Number(row.total_credit);
        summary[name].liabilityRefunded += Number(row.total_debit);
      } else if (row.account_type === 'expense') {
        summary[name].expense +=
          Number(row.total_credit) - Number(row.total_debit);
      }
    });

    return summary;
  }

  // GET YEARLY SUMMARY: High-level financial totals for a portfolio-wide report.
  async getYearlySummary(propertyIds, year, startDate = null, endDate = null) {
    if (!propertyIds || propertyIds.length === 0) {
      return {
        totalRevenue: 0,
        totalLiabilityHeld: 0,
        totalLiabilityRefunded: 0,
        totalExpense: 0,
        netOperatingIncome: 0,
      };
    }

    // 1. [QUERY] Filtered Aggregation
    let query = `SELECT al.account_type, al.category, SUM(al.credit) AS total_credit, SUM(al.debit) AS total_debit
       FROM accounting_ledger al
       JOIN leases l ON al.lease_id = l.lease_id
       JOIN units u ON l.unit_id = u.unit_id
       JOIN properties p ON u.property_id = p.property_id
       WHERE p.property_id IN (?)`;

    const params = [propertyIds];

    if (startDate && endDate) {
      query += ` AND al.entry_date BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else {
      query += ` AND YEAR(al.entry_date) = ?`;
      params.push(year);
    }

    query += ` GROUP BY al.account_type, al.category`;

    const [rows] = await pool.query(query, params);

    let totalRevenueCollected = 0,
      totalRevenueEarned = 0,
      totalLiabilityHeld = 0,
      totalLiabilityRefunded = 0,
      totalExpense = 0;

    // 2. [TRANSFORMATION] Financial Resolution
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
      totalLiabilityHeld,
      totalLiabilityRefunded,
      netLiability: totalLiabilityHeld - totalLiabilityRefunded,
      totalExpense,
      netOperatingIncome: totalRevenueCollected - totalExpense,
    };
  }

  // GET MONTHLY STATS: Time-series data for income/expense trends.
  async getMonthlyStats(propertyIds, monthsLimit = 12) {
    if (!propertyIds || propertyIds.length === 0) return [];

    // 1. [QUERY] Historical Aggregate
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

    // 2. [TRANSFORMATION] Pivot Data by Month
    rows.forEach((row) => {
      const month = row.month_label;
      if (!monthlyData[month])
        monthlyData[month] = { month, revenue: 0, expense: 0 };

      if (row.account_type === 'revenue') {
        monthlyData[month].revenue += Number(row.total_credit);
      } else if (row.account_type === 'expense') {
        monthlyData[month].expense +=
          Number(row.total_credit) - Number(row.total_debit);
      }
    });

    return Object.values(monthlyData);
  }

  // FIND MISMATCHES: Audit utility to find payments/invoices that fell through the ledger cracks.
  async findMismatches() {
    // 1. [QUERY] Credit Gap Detection: Verified payments without ledger offsets
    const [payments] = await pool.query(`
        SELECT p.payment_id, p.amount, p.invoice_id, p.status, 'payment' as record_type
        FROM payments p
        LEFT JOIN accounting_ledger al ON p.payment_id = al.payment_id
        WHERE p.status = 'verified' AND al.entry_id IS NULL
    `);

    // 2. [QUERY] Debit Gap Detection: Outstanding invoices without accrual ledger entries
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
