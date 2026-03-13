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

  /**
   * Get all ledger entries for a specific lease.
   */
  async findByLeaseId(leaseId) {
    const [rows] = await pool.query(
      `SELECT * FROM accounting_ledger WHERE lease_id = ? ORDER BY entry_date DESC, entry_id DESC`,
      [leaseId]
    );
    return rows;
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
          revenue: 0,
          liabilityHeld: 0,
          liabilityRefunded: 0,
          expense: 0,
        };
      }

      const net = Number(row.total_credit) - Number(row.total_debit);

      if (row.account_type === 'revenue') {
        summary[name].revenue += net;
      } else if (row.account_type === 'liability') {
        // Credits increase liability (deposit received)
        // Debits decrease liability (deposit refunded)
        summary[name].liabilityHeld += Number(row.total_credit);
        summary[name].liabilityRefunded += Number(row.total_debit);
      } else if (row.account_type === 'expense') {
        summary[name].expense += net;
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

    let totalRevenue = 0;
    let totalLiabilityHeld = 0;
    let totalLiabilityRefunded = 0;
    let totalExpense = 0;

    rows.forEach((row) => {
      const credit = Number(row.total_credit);
      const debit = Number(row.total_debit);

      if (row.account_type === 'revenue') {
        totalRevenue += credit;
      } else if (row.account_type === 'liability') {
        totalLiabilityHeld += credit;
        totalLiabilityRefunded += debit;
      } else if (row.account_type === 'expense') {
        totalExpense += credit;
      }
    });

    return {
      totalRevenue,
      totalLiabilityHeld,
      totalLiabilityRefunded,
      netLiability: totalLiabilityHeld - totalLiabilityRefunded,
      totalExpense,
      netOperatingIncome: totalRevenue - totalExpense,
    };
  }
}

export default new LedgerModel();
