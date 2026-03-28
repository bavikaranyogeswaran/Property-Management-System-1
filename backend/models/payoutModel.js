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
    return rows.map(row => ({
      id: row.payout_id.toString(),
      ownerId: row.owner_id.toString(),
      amount: parseFloat(row.amount),
      periodStart: row.period_start,
      periodEnd: row.period_end,
      generatedAt: row.generated_at,
      status: row.status,
      processedAt: row.processed_at
    }));
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

  // Core Logic: Rent - Expenses (Captures snapshot of IDs to prevent race conditions)
  async calculateNetPayout(ownerId, startDate, endDate, connection) {
    const db = connection || pool;
    // 1. Snapshot Income IDs and Total
    const [incomeRows] = await db.query(
      `
            SELECT p.payment_id as paymentId, p.amount
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

    const incomeIds = incomeRows.map(r => r.paymentId);
    const totalIncome = incomeRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    // 2. Snapshot Expense IDs and Total
    const [expenseRows] = await db.query(
      `
            SELECT mc.cost_id as costId, mc.amount
            FROM maintenance_costs mc
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id
            JOIN units u ON mr.unit_id = u.unit_id
            JOIN properties prop ON u.property_id = prop.property_id
            WHERE prop.owner_id = ?
            AND mc.status = 'active'
            AND mc.payout_id IS NULL
            AND mc.recorded_date <= ?
        `,
      [ownerId, endDate]
    );

    const expenseIds = expenseRows.map(r => r.costId);
    const totalExpenses = expenseRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    return {
      totalIncome,
      totalExpenses,
      netPayout: totalIncome - totalExpenses,
      incomeIds,
      expenseIds,
    };
  }

  async linkRecordsToPayout(payoutId, incomeIds, expenseIds, connection) {
    const db = connection || pool;
    
    // Link payments to the new payout IF there are any IDs
    if (incomeIds && incomeIds.length > 0) {
      await db.query(
        'UPDATE payments SET payout_id = ? WHERE payment_id IN (?)',
        [payoutId, incomeIds]
      );
    }

    // Link maintenance costs to the new payout IF there are any IDs
    if (expenseIds && expenseIds.length > 0) {
      await db.query(
        'UPDATE maintenance_costs SET payout_id = ? WHERE cost_id IN (?)',
        [payoutId, expenseIds]
      );
    }
    return true;
  }
}

export default new PayoutModel();
