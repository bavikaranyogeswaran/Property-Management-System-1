// ============================================================================
//  PAYOUT SERVICE (The Owner's Accountant)
// ============================================================================
//  This service calculates the complex math of profit sharing.
//  It subtracts agency commissions and maintenance expenses from the total
//  rent collected to find the final payout for the property owner.
// ============================================================================

import payoutModel from '../models/payoutModel.js';
import ledgerModel from '../models/ledgerModel.js';
import pool from '../config/db.js';
import { fromCents } from '../utils/moneyUtils.js';

class PayoutService {
  // PREVIEW PAYOUT: Non-destructive calculation engine. Simulate profit sharing for a given date range.
  async previewPayout(ownerId, startDate, endDate, selection = null) {
    if (!endDate) throw new Error('End date is required');
    return await payoutModel.calculateNetPayout(
      ownerId,
      startDate,
      endDate,
      null,
      selection
    );
  }

  // CREATE PAYOUT: Formalizes a profit-sharing cycle. Locks financial records and generates management fee revenue.
  async createPayout(ownerId, startDate, endDate, selection = null) {
    if (!endDate) throw new Error('End date is required');

    // 1. [CONCURRENCY] Idempotency Check: Prevent duplicate payouts for overlapping periods
    const isSelective = !!(
      selection?.incomeIds?.length || selection?.expenseIds?.length
    );
    if (
      await payoutModel.checkOverlap(ownerId, startDate, endDate, isSelective)
    ) {
      throw new Error(
        'A payout record already exists that covers part of this period.'
      );
    }

    const connection = await (
      await import('../config/db.js')
    ).default.getConnection();
    try {
      await connection.beginTransaction();

      // 2. [FINANCIAL] Calculate Net distribution: Income - Commissions - Expenses - Debt Offsets
      const {
        totalGross,
        totalCommission,
        totalExpenses,
        netPayout,
        deficit,
        deficitPayoutIds,
        incomeIds,
        expenseIds,
        leaseCommissions,
      } = await payoutModel.calculateNetPayout(
        ownerId,
        startDate,
        endDate,
        connection,
        selection
      );
      if (incomeIds.length === 0 && expenseIds.length === 0)
        throw new Error('No eligible records found.');

      // [S4 FIX] Ownership validation: Warn if requested IDs were silently excluded
      // The SQL already filters by owner_id, so mismatched IDs simply won't appear.
      // We surface this as an explicit error to prevent silent underpayment.
      if (selection?.incomeIds?.length) {
        const requested = selection.incomeIds.length;
        const found = incomeIds.length;
        if (found !== requested) {
          throw new Error(
            `Income selection mismatch: ${found} of ${requested} selected payment(s) matched this owner. ` +
              `${requested - found} payment(s) were excluded — they may belong to another owner or have already been disbursed.`
          );
        }
      }

      if (selection?.expenseIds?.length) {
        const requested = selection.expenseIds.length;
        const found = expenseIds.length;
        if (found !== requested) {
          throw new Error(
            `Expense selection mismatch: ${found} of ${requested} selected expense(s) matched this owner. ` +
              `${requested - found} expense(s) were excluded — they may belong to another owner or have already been disbursed.`
          );
        }
      }

      // 3. Persist the high-level Payout record
      const payoutId = await payoutModel.create(
        {
          ownerId,
          grossAmount: totalGross,
          commissionAmount: totalCommission,
          expensesAmount: totalExpenses,
          deficitAmount: deficit,
          periodStart: startDate,
          periodEnd: endDate,
        },
        connection
      );

      // 4. [AUDIT] Atomic Linking: Tag all processed invoices and expenses with this Payout ID to prevent re-processing
      await payoutModel.linkRecordsToPayout(
        payoutId,
        incomeIds,
        expenseIds,
        connection
      );

      // 5. [FINANCIAL] Debt Recovery: If this payout clears previous owner debts (deficits), mark those records as settled
      if (deficitPayoutIds && deficitPayoutIds.length > 0)
        await payoutModel.markDeficitsAsOffset(
          payoutId,
          deficitPayoutIds,
          connection
        );

      // 6. [SIDE EFFECT] Revenue Recognition: Record the Agency's management commission in the Ledger
      if (leaseCommissions && Object.keys(leaseCommissions).length > 0) {
        for (const [leaseId, amount] of Object.entries(leaseCommissions)) {
          if (amount <= 0) continue;
          await ledgerModel.create(
            {
              leaseId,
              accountType: 'revenue',
              category: 'management_fee',
              credit: amount,
              debit: 0,
              description: `Management fee revenue from Payout #${payoutId}`,
              entryDate: new Date().toISOString().split('T')[0],
            },
            connection
          );
        }
      }

      await connection.commit();
      return { payoutId, netPayout };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // GET HISTORY: Fetch all past payouts for an owner.
  async getHistory(ownerId) {
    return await payoutModel.findByOwnerId(ownerId);
  }

  // GET BY ID: Admin-level deep fetch of a single payout record.
  async getPayoutById(payoutId) {
    const [row] = await (
      await import('../config/db.js')
    ).default.query('SELECT * FROM owner_payouts WHERE payout_id = ?', [
      payoutId,
    ]);
    return row[0] || null;
  }

  // MARK AS PAID: Financial closure step. Treasurer confirms bank transfer completion.
  async markAsPaid(payoutId, treasurerId, bankReference, proofUrl = null) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. [CONCURRENCY] Row-level Lock: Prevent race conditions if two managers update simultaneously
      const payout = await payoutModel.findByIdForUpdate(payoutId, connection);
      if (!payout) throw new Error('Payout record not found.');
      if (payout.status !== 'pending')
        throw new Error(`Cannot pay record with status: ${payout.status}`);

      // 2. Perform DB update with payment meta-data
      await payoutModel.markAsPaid(
        payoutId,
        treasurerId,
        bankReference,
        proofUrl,
        connection
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ACKNOWLEDGE: Owner step to confirm receipt of funds.
  async acknowledgePayout(ownerId, payoutId) {
    const history = await payoutModel.findByOwnerId(ownerId);
    const payout = history.find((p) => String(p.id) === String(payoutId));
    if (!payout || payout.status !== 'paid')
      throw new Error('Payout not eligible for acknowledgment.');

    await payoutModel.acknowledge(payoutId);
    return true;
  }

  // DISPUTE: Owner step to flag potential calculation errors.
  async disputePayout(ownerId, payoutId, reason) {
    const history = await payoutModel.findByOwnerId(ownerId);
    const payout = history.find((p) => String(p.id) === String(payoutId));
    if (!payout || payout.status !== 'paid')
      throw new Error('Payout not eligible for dispute.');

    await payoutModel.dispute(payoutId, reason);
    return true;
  }

  // GET DETAILS: Full breakdown of every line-item constituent in a payout.
  async getPayoutDetails(ownerId, payoutId) {
    // 1. [SECURITY] Resolve ownership scope
    const payouts = await payoutModel.findByOwnerId(ownerId);
    const payout = payouts.find((p) => String(p.id) === String(payoutId));
    if (!payout) throw new Error('Payout not found or access denied.');

    // 2. Aggregate details (constituent invoices and maintenance costs)
    const details = await payoutModel.getPayoutDetails(payoutId);

    return {
      ...details,
      summary: {
        totalGross: payout.grossAmount,
        totalCommission: payout.commissionAmount,
        totalExpenses: payout.expensesAmount,
        netPayout: payout.amount,
        periodStart: payout.periodStart,
        periodEnd: payout.periodEnd,
        status: payout.status,
        bankReference: payout.bankReference,
        proofUrl: payout.proofUrl,
        acknowledgedAt: payout.acknowledgedAt,
        disputeReason: payout.disputeReason,
      },
    };
  }

  // EXPORT CSV: Generates a bank-ready or tax-ready constituent breakdown.
  async exportPayoutCSV(ownerId, payoutId) {
    // 1. Fetch detailed constituent records
    const details = await this.getPayoutDetails(ownerId, payoutId);

    // 2. CSV Sanitization helper
    const esc = (val) =>
      val === null || val === undefined
        ? '""'
        : `"${String(val).replace(/"/g, '""')}"`;

    // 3. Mapping Engine: Convert constituent models into CSV rows
    const rows = [
      [
        'Property',
        'Unit',
        'Type',
        'Description',
        'Date',
        'Income (LKR)',
        'Expense (LKR)',
      ].map(esc),
    ];

    // Add Incomes (Rent, Fees)
    details.income.forEach((i) => {
      const type =
        i.invoice_type === 'rent'
          ? 'Rent'
          : i.invoice_type === 'late_fee'
            ? 'Late Fee'
            : 'Misc';
      rows.push([
        esc(i.property_name),
        esc(i.unit_number),
        esc(type),
        esc(i.invoice_description || `${type} for ${i.month}/${i.year}`),
        esc(i.payment_date),
        esc(fromCents(i.amount).toFixed(2)),
        esc('0.00'),
      ]);
    });

    // Add Expenses (Maintenance)
    details.expenses.forEach((e) =>
      rows.push([
        esc(e.property_name),
        esc(e.unit_number),
        esc('Maintenance'),
        esc(e.description || e.request_title),
        esc(e.recorded_date),
        esc('0.00'),
        esc(fromCents(e.amount).toFixed(2)),
      ])
    );

    // 4. Summary Breakdown
    rows.push([]);
    rows.push(
      [
        'TOTAL RENT COLLECTED',
        '',
        '',
        '',
        '',
        fromCents(details.summary.totalGross).toFixed(2),
        '',
      ].map(esc)
    );
    rows.push(
      [
        'AGENCY MANAGEMENT FEE',
        '',
        '',
        '',
        '',
        '',
        fromCents(details.summary.totalCommission).toFixed(2),
      ].map(esc)
    );
    rows.push(
      [
        'TOTAL EXPENSES (MAINTENANCE)',
        '',
        '',
        '',
        '',
        '',
        fromCents(details.summary.totalExpenses).toFixed(2),
      ].map(esc)
    );
    rows.push([]);
    rows.push(
      [
        'NET PAYOUT TO OWNER',
        '',
        '',
        '',
        '',
        fromCents(details.summary.netPayout).toFixed(2),
        '',
      ].map(esc)
    );

    return rows.map((r) => r.join(',')).join('\n');
  }
}

export default new PayoutService();
