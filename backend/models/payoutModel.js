import pool from '../config/db.js';

class PayoutModel {
  async create(data, connection) {
    const {
      ownerId,
      grossAmount,
      commissionAmount,
      expensesAmount,
      periodStart,
      periodEnd,
    } = data;
    const db = connection || pool;
    try {
      // NOTE: `amount` column is a STORED GENERATED column (gross - commission - expenses)
      // It is computed automatically by MySQL and must NOT be included in INSERT/UPDATE.
      const [result] = await db.query(
        'INSERT INTO owner_payouts (owner_id, gross_amount, commission_amount, expenses_amount, period_start, period_end) VALUES (?, ?, ?, ?, ?, ?)',
        [
          ownerId,
          grossAmount,
          commissionAmount,
          expensesAmount,
          periodStart,
          periodEnd,
        ]
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
    return rows.map((row) => ({
      id: row.payout_id.toString(),
      ownerId: row.owner_id.toString(),
      grossAmount: Number(row.gross_amount),
      commissionAmount: Number(row.commission_amount),
      expensesAmount: Number(row.expenses_amount),
      amount: Number(row.amount),
      periodStart: row.period_start,
      periodEnd: row.period_end,
      status: row.status,
      bankReference: row.bank_reference,
      proofUrl: row.proof_url,
      treasurerId: row.treasurer_id ? row.treasurer_id.toString() : null,
      generatedAt: row.generated_at,
      processedAt: row.processed_at,
      acknowledgedAt: row.acknowledged_at,
      disputeReason: row.dispute_reason,
    }));
  }

  async markAsPaid(payoutId, treasurerId, bankReference, proofUrl = null) {
    await pool.query(
      'UPDATE owner_payouts SET status = "paid", processed_at = NOW(), treasurer_id = ?, bank_reference = ?, proof_url = ? WHERE payout_id = ?',
      [treasurerId, bankReference, proofUrl, payoutId]
    );
    return true;
  }

  async acknowledge(payoutId) {
    await pool.query(
      'UPDATE owner_payouts SET status = "acknowledged", acknowledged_at = NOW() WHERE payout_id = ?',
      [payoutId]
    );
    return true;
  }

  async dispute(payoutId, reason) {
    await pool.query(
      'UPDATE owner_payouts SET status = "disputed", dispute_reason = ? WHERE payout_id = ?',
      [reason, payoutId]
    );
    return true;
  }

  async checkOverlap(ownerId, startDate, endDate, skipIfSelective = false) {
    if (skipIfSelective) return false; // Records themselves ensure uniqueness in selective mode
    // Check if any existing payout overlaps with the requested range
    const [rows] = await pool.query(
      `
            SELECT 1 FROM owner_payouts 
            WHERE owner_id = ? 
            AND period_end >= ?
            LIMIT 1
        `,
      [ownerId, startDate]
    );
    return rows.length > 0;
  }

  // Core Logic: Rent - Expenses (Captures snapshot of IDs to prevent race conditions)
  async calculateNetPayout(
    ownerId,
    startDate,
    endDate,
    connection,
    selection = null
  ) {
    const db = connection || pool;

    // 1. Snapshot Income IDs and Total
    let incomeQuery = `
            SELECT p.payment_id as paymentId, p.amount, prop.management_fee_percentage as fee, ri.invoice_type as invoiceType,
                   ri.lease_id as leaseId, u.unit_number, prop.name as property_name, p.payment_date, ri.month, ri.year, ri.description as invoice_description
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties prop ON u.property_id = prop.property_id
            WHERE prop.owner_id = ? 
            AND p.status = 'verified'
            AND ri.invoice_type NOT IN ('deposit')
            AND p.payout_id IS NULL
            AND p.payment_date >= ? AND p.payment_date <= ?
        `;
    const incomeParams = [ownerId, startDate, endDate];

    if (selection?.incomeIds && selection.incomeIds.length > 0) {
      incomeQuery += ` AND p.payment_id IN (?)`;
      incomeParams.push(selection.incomeIds);
    }

    const [incomeRows] = await db.query(incomeQuery, incomeParams);

    const incomeIds = incomeRows.map((r) => r.paymentId);
    const totalGross = incomeRows.reduce((sum, r) => sum + Number(r.amount), 0);

    // Calculate commissions and group by lease for ledger consistency
    const leaseCommissions = {};
    const totalCommission = incomeRows.reduce((sum, r) => {
      if (['rent', 'late_fee'].includes(r.invoiceType)) {
        const fee = Number(r.fee || 0);
        const comm = Math.round(Number(r.amount) * (fee / 100));

        const lid = r.leaseId;
        leaseCommissions[lid] = (leaseCommissions[lid] || 0) + comm;

        return sum + comm;
      }
      return sum;
    }, 0);

    // 2. Snapshot Expense IDs and Total
    let expenseQuery = `
            SELECT mc.cost_id as costId, mc.amount, mc.recorded_date, mc.description, mc.bill_to,
                   u.unit_number, prop.name as property_name, mr.title as request_title
            FROM maintenance_costs mc
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id
            JOIN units u ON mr.unit_id = u.unit_id
            JOIN properties prop ON u.property_id = prop.property_id
            WHERE prop.owner_id = ?
            AND mc.status = 'active'
            AND (mc.bill_to = 'owner' OR mc.bill_to IS NULL)
            AND mc.payout_id IS NULL
            AND mc.recorded_date >= ? AND mc.recorded_date <= ?
        `;
    const expenseParams = [ownerId, startDate, endDate];

    if (selection?.expenseIds && selection.expenseIds.length > 0) {
      expenseQuery += ` AND mc.cost_id IN (?)`;
      expenseParams.push(selection.expenseIds);
    }

    const [expenseRows] = await db.query(expenseQuery, expenseParams);

    const expenseIds = expenseRows.map((r) => r.costId);
    const totalExpenses = expenseRows.reduce(
      (sum, r) => sum + Number(r.amount),
      0
    );

    return {
      totalGross,
      totalCommission,
      totalExpenses,
      netPayout: totalGross - totalCommission - totalExpenses,
      incomeIds,
      expenseIds,
      leaseCommissions, // New: for ledger integration
      // Pass back full details for the frontend preview list
      details: {
        income: incomeRows,
        expenses: expenseRows,
      },
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

  async getPayoutDetails(payoutId, connection = null) {
    const db = connection || pool;

    // 1. Fetch Income Breakdown (Rent, Late Fees, etc.)
    const [income] = await db.query(
      `
            SELECT 
                p.payment_id,
                p.amount,
                p.payment_date,
                ri.invoice_type,
                ri.month,
                ri.year,
                ri.description as invoice_description,
                u.unit_number,
                prop.name as property_name
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties prop ON u.property_id = prop.property_id
            WHERE p.payout_id = ?
            ORDER BY prop.name, u.unit_number, p.payment_date
        `,
      [payoutId]
    );

    // 2. Fetch Expense Breakdown (Maintenance)
    const [expenses] = await db.query(
      `
            SELECT 
                mc.cost_id,
                mc.amount,
                mc.recorded_date,
                mc.description,
                mc.bill_to,
                u.unit_number,
                prop.name as property_name,
                mr.title as request_title
            FROM maintenance_costs mc
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id
            JOIN units u ON mr.unit_id = u.unit_id
            JOIN properties prop ON u.property_id = prop.property_id
            WHERE mc.payout_id = ?
            ORDER BY prop.name, u.unit_number, mc.recorded_date
        `,
      [payoutId]
    );

    return { income, expenses };
  }
}

export default new PayoutModel();
