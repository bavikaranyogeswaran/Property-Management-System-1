import pool from '../config/db.js';

class PayoutModel {
  async create(data, connection) {
    const { ownerId, amount, periodStart, periodEnd } = data;
    const db = connection || pool;
    try {
      const [result] = await db.query(
        'INSERT INTO owner_payouts (owner_id, amount, period_start, period_end) VALUES (?, ?, ?, ?)',
        [ownerId, amount, periodStart, periodEnd]
      );
      return result.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('A payout for this owner and period already exists.');
      }
      throw error;
    }
  }

  async findByOwnerId(ownerId) {
    const [rows] = await pool.query(
      'SELECT * FROM owner_payouts WHERE owner_id = ? ORDER BY generated_at DESC',
      [ownerId]
    );
    return rows;
  }

  async markAsProcessed(payoutId) {
    await pool.query(
      'UPDATE owner_payouts SET status = "processed", processed_at = NOW() WHERE payout_id = ?',
      [payoutId]
    );
    return true;
  }

  async checkOverlap(ownerId, startDate, endDate) {
    // Check if any existing payout overlaps with the requested range
    // Overlap logic: (StartA <= EndB) and (EndA >= StartB)
    const [rows] = await pool.query(
      `
            SELECT 1 FROM owner_payouts 
            WHERE owner_id = ? 
            AND period_end >= ?
            LIMIT 1
        `,
      [ownerId, startDate] // If new payout starts before an old one ends, it's an overlap
    );
    return rows.length > 0;
  }

  // Core Logic: Rent - Expenses (Captures un-linked records)
  async calculateNetPayout(ownerId, startDate, endDate, connection) {
    const db = connection || pool;
    // 1. Total Verified Payments (Income)
    // Join: Payments -> Invoices -> Leases -> Units -> Properties
    const [incomeRows] = await db.query(
      `
            SELECT COALESCE(SUM(p.amount), 0) as total_income
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties prop ON u.property_id = prop.property_id
            WHERE prop.owner_id = ? 
            AND p.status = 'verified'
            AND ri.invoice_type != 'deposit'
            AND p.payout_id IS NULL
            AND p.payment_date <= ?
        `,
      [ownerId, endDate]
    );

    const totalIncome = parseFloat(incomeRows[0].total_income);

    // 2. Total Maintenance Costs (Expenses)
    // Join: MaintCosts -> MaintRequests -> Units -> Properties
    const [expenseRows] = await db.query(
      `
            SELECT COALESCE(SUM(mc.amount), 0) as total_expenses
            FROM maintenance_costs mc
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id
            JOIN units u ON mr.unit_id = u.unit_id
            JOIN properties prop ON u.property_id = prop.property_id
            WHERE prop.owner_id = ?
            AND mc.payout_id IS NULL
            AND mc.recorded_date <= ?
        `,
      [ownerId, endDate]
    );

    const totalExpenses = parseFloat(expenseRows[0].total_expenses);

    return {
      totalIncome,
      totalExpenses,
      netPayout: totalIncome - totalExpenses,
    };
  }

  async linkRecordsToPayout(payoutId, ownerId, startDate, endDate, connection) {
    const db = connection || pool;
    // Link payments to the new payout
    await db.query(
      `
            UPDATE payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties prop ON u.property_id = prop.property_id
            SET p.payout_id = ?
            WHERE prop.owner_id = ? 
            AND p.status = 'verified'
            AND ri.invoice_type != 'deposit'
            AND p.payout_id IS NULL
            AND p.payment_date <= ?
        `,
      [payoutId, ownerId, endDate]
    );

    // Link maintenance costs to the new payout
    await db.query(
      `
            UPDATE maintenance_costs mc
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id
            JOIN units u ON mr.unit_id = u.unit_id
            JOIN properties prop ON u.property_id = prop.property_id
            SET mc.payout_id = ?
            WHERE prop.owner_id = ?
            AND mc.payout_id IS NULL
            AND mc.recorded_date <= ?
        `,
      [payoutId, ownerId, endDate]
    );
    return true;
  }
}

export default new PayoutModel();
