// ============================================================================
//  PAYOUT MODEL (The Dividend Record)
// ============================================================================
//  Saves the historical record of money distributed to owners.
// ============================================================================

import pool from '../config/db.js';
import { moneyMath } from '../utils/moneyUtils.js';

class PayoutModel {
  // CREATE: Records a new dividend snapshot for an owner's portfolio.
  async create(data, connection) {
    const {
      ownerId,
      grossAmount,
      commissionAmount,
      expensesAmount,
      deficitAmount = 0,
      periodStart,
      periodEnd,
    } = data;
    const db = connection || pool;
    try {
      // 1. [DATA] Persistence: Insert the payout record (Note: 'amount' is a generated column)
      const [result] = await db.query(
        'INSERT INTO owner_payouts (owner_id, gross_amount, commission_amount, expenses_amount, period_start, period_end) VALUES (?, ?, ?, ?, ?, ?)',
        [
          ownerId,
          grossAmount,
          commissionAmount,
          expensesAmount,
          deficitAmount,
          periodStart,
          periodEnd,
        ]
      );
      return result.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY')
        throw new Error('A payout for this owner and period already exists.');
      throw error;
    }
  }

  // FIND BY OWNER ID: Lists the payment history and dividend lifecycle for an investor.
  async findByOwnerId(ownerId) {
    // 1. [QUERY] Extraction: Sorting by most recent dividend first
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

  // MARK AS PAID: Updates status and attaches financial proof (bank reference) after disbursement.
  async markAsPaid(
    payoutId,
    treasurerId,
    bankReference,
    proofUrl = null,
    connection = null
  ) {
    const db = connection || pool;
    // 1. [DATA] State Persistence: Finalize the transaction distribution
    await db.query(
      'UPDATE owner_payouts SET status = "paid", processed_at = NOW(), treasurer_id = ?, bank_reference = ?, proof_url = ? WHERE payout_id = ?',
      [treasurerId, bankReference, proofUrl, payoutId]
    );
    return true;
  }

  // FIND BY ID FOR UPDATE: Row-level locking to prevent race conditions during payout finalization.
  async findByIdForUpdate(payoutId, connection) {
    if (!connection)
      throw new Error('connection required for findByIdForUpdate');
    // 1. [SECURITY] Locking: Execute SELECT FOR UPDATE to synchronize concurrent payout attempts
    const [rows] = await connection.query(
      'SELECT * FROM owner_payouts WHERE payout_id = ? FOR UPDATE',
      [payoutId]
    );
    if (!rows[0]) return null;
    return rows[0];
  }

  // ACKNOWLEDGE: Record owner receipt and agreement with the distribution.
  async acknowledge(payoutId) {
    // 1. [DATA] Progress Update
    await pool.query(
      'UPDATE owner_payouts SET status = "acknowledged", acknowledged_at = NOW() WHERE payout_id = ?',
      [payoutId]
    );
    return true;
  }

  // DISPUTE: Halts automation for a payout if an owner flags a discrepancy.
  async dispute(payoutId, reason) {
    // 1. [DATA] Status Escalation
    await pool.query(
      'UPDATE owner_payouts SET status = "disputed", dispute_reason = ? WHERE payout_id = ?',
      [reason, payoutId]
    );
    return true;
  }

  // CHECK OVERLAP: Ensures no two payouts cover the same date range for one owner.
  async checkOverlap(ownerId, startDate, endDate, skipIfSelective = false) {
    // 1. [SECURITY] Date Boundary Enforcement: Standard interval overlap algorithm [A <= D AND B >= C]
    const [rows] = await pool.query(
      `SELECT 1 FROM owner_payouts
       WHERE owner_id = ?
         AND status NOT IN ('disputed')
         AND (
           (period_start <= ? AND period_end >= ?)
         )
       LIMIT 1`,
      [ownerId, endDate, startDate]
    );
    return rows.length > 0;
  }

  // CALCULATE NET PAYOUT: Orchestrates the core dividend logic, aggregating income and subtracting costs.
  async calculateNetPayout(
    ownerId,
    startDate,
    endDate,
    connection,
    selection = null
  ) {
    const db = connection || pool;
    const isSelective = !!(
      selection?.incomeIds?.length || selection?.expenseIds?.length
    );
    let totalExpenses = 0;

    // 1. [SECURITY] Deficit Detection: Offset previous losses against current earnings (if not selective)
    let deficitPayoutIds = [];
    if (!isSelective) {
      const [payoutsWithDeficit] = await db.query(
        'SELECT payout_id, deficit_amount FROM owner_payouts WHERE owner_id = ? AND deficit_amount > 0 AND deficit_offset_payout_id IS NULL',
        [ownerId]
      );
      deficitPayoutIds = payoutsWithDeficit.map((p) => p.payout_id);
      totalExpenses = payoutsWithDeficit.reduce(
        (sum, p) => moneyMath(sum).add(p.deficit_amount).value(),
        0
      );
    }

    // 2. [QUERY] Income Aggregation: Snapshot rent/fees that are verified and not yet disbursed
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
    const totalGross = incomeRows.reduce(
      (sum, r) => moneyMath(sum).add(r.amount).value(),
      0
    );

    // 3. [TRANSFORMATION] Commission Calculation: Deduct system fees per lease template
    const leaseCommissions = {};
    const totalCommission = incomeRows.reduce((sum, r) => {
      if (['rent', 'late_fee'].includes(r.invoiceType)) {
        const fee = Number(r.fee || 0);
        const comm = moneyMath(r.amount).div(100).mul(fee).round().value();
        const lid = r.leaseId;
        leaseCommissions[lid] = moneyMath(leaseCommissions[lid] || 0)
          .add(comm)
          .value();
        return moneyMath(sum).add(comm).value();
      }
      return sum;
    }, 0);

    // 4. [QUERY] Expense Aggregation: Snapshot maintenance costs attributed to the owner
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
    const currentExpenses = expenseRows.reduce(
      (sum, r) => moneyMath(sum).add(r.amount).value(),
      0
    );
    totalExpenses = moneyMath(totalExpenses).add(currentExpenses).value();

    // 5. [DATA] Net Finalization: Compute final distribution after all deductions
    const rawNet = moneyMath(totalGross)
      .sub(totalCommission)
      .sub(totalExpenses)
      .value();

    return {
      totalGross,
      totalCommission,
      totalExpenses,
      netPayout: Math.max(0, rawNet),
      deficit: rawNet < 0 ? Math.abs(rawNet) : 0,
      deficitPayoutIds,
      incomeIds,
      expenseIds,
      leaseCommissions,
      details: { income: incomeRows, expenses: expenseRows },
    };
  }

  // LINK RECORDS: Semi-finalizes records by flagging them with the new Payout ID.
  async linkRecordsToPayout(payoutId, incomeIds, expenseIds, connection) {
    const db = connection || pool;
    // 1. [DATA] Persistence: Batch update payments and costs to prevent double-payouts
    if (incomeIds && incomeIds.length > 0) {
      await db.query(
        'UPDATE payments SET payout_id = ? WHERE payment_id IN (?)',
        [payoutId, incomeIds]
      );
    }
    if (expenseIds && expenseIds.length > 0) {
      await db.query(
        'UPDATE maintenance_costs SET payout_id = ? WHERE cost_id IN (?)',
        [payoutId, expenseIds]
      );
    }
    return true;
  }

  // GET PAYOUT DETAILS: Fully resolves the breakdown for a historical distribution.
  async getPayoutDetails(payoutId, connection = null) {
    const db = connection || pool;
    // 1. [QUERY] Detailed Breakdown: Fetches specific payments and costs tied to this payout
    const [income] = await db.query(
      `SELECT p.payment_id, p.amount, p.payment_date, ri.invoice_type, ri.month, ri.year, ri.description as invoice_description,
                u.unit_number, prop.name as property_name
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties prop ON u.property_id = prop.property_id
            WHERE p.payout_id = ?
            ORDER BY prop.name, u.unit_number, p.payment_date`,
      [payoutId]
    );

    const [expenses] = await db.query(
      `SELECT mc.cost_id, mc.amount, mc.recorded_date, mc.description, mc.bill_to, u.unit_number, prop.name as property_name, mr.title as request_title
            FROM maintenance_costs mc
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id
            JOIN units u ON mr.unit_id = u.unit_id
            JOIN properties prop ON u.property_id = prop.property_id
            WHERE mc.payout_id = ?
            ORDER BY prop.name, u.unit_number, mc.recorded_date`,
      [payoutId]
    );

    return { income, expenses };
  }

  // MARK DEFICITS AS OFFSET: Links previous debt records to the new surplus payout that covered them.
  async markDeficitsAsOffset(newPayoutId, oldDeficitPayoutIds, connection) {
    if (!oldDeficitPayoutIds || oldDeficitPayoutIds.length === 0) return;
    const db = connection || pool;
    // 1. [DATA] State Persistence: Finalize the debt reconciliation
    await db.query(
      'UPDATE owner_payouts SET deficit_offset_payout_id = ? WHERE payout_id IN (?)',
      [newPayoutId, oldDeficitPayoutIds]
    );
  }
}

export default new PayoutModel();
