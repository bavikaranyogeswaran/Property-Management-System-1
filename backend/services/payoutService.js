import payoutModel from '../models/payoutModel.js';
import ledgerModel from '../models/ledgerModel.js';
import pool from '../config/db.js';
import { fromCents } from '../utils/moneyUtils.js';

class PayoutService {
  async previewPayout(ownerId, startDate, endDate, selection = null) {
    if (!endDate) {
      throw new Error('End date is required');
    }
    return await payoutModel.calculateNetPayout(
      ownerId,
      startDate,
      endDate,
      null,
      selection
    );
  }

  async createPayout(ownerId, startDate, endDate, selection = null) {
    if (!endDate) {
      throw new Error('End date is required');
    }

    const isSelective = !!(
      selection?.incomeIds?.length || selection?.expenseIds?.length
    );
    const hasOverlap = await payoutModel.checkOverlap(
      ownerId,
      startDate,
      endDate,
      isSelective
    );
    if (hasOverlap) {
      throw new Error(
        'A payout record already exists that covers part of this period.'
      );
    }

    const connection = await (
      await import('../config/db.js')
    ).default.getConnection();
    try {
      await connection.beginTransaction();

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

      if (incomeIds.length === 0 && expenseIds.length === 0) {
        throw new Error('No eligible records found for this payout period.');
      }

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

      await payoutModel.linkRecordsToPayout(
        payoutId,
        incomeIds,
        expenseIds,
        connection
      );

      // [NEW] Deficit Recovery Recovery: Mark old deficits as settled by this payout
      if (deficitPayoutIds && deficitPayoutIds.length > 0) {
        await payoutModel.markDeficitsAsOffset(
          payoutId,
          deficitPayoutIds,
          connection
        );
      }

      // [NEW] Accounting Integration: Record Management Fee Revenue in Ledger
      // We process each lease's portion of the commission to maintain ledger granularity.
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

  async getHistory(ownerId) {
    return await payoutModel.findByOwnerId(ownerId);
  }

  async getPayoutById(payoutId) {
    // Note: This is an internal helper or for admins. Standard usage should go through role-aware finders.
    const [row] = await (
      await import('../config/db.js')
    ).default.query('SELECT * FROM owner_payouts WHERE payout_id = ?', [
      payoutId,
    ]);
    if (!row[0]) return null;
    return row[0];
  }

  async markAsPaid(payoutId, treasurerId, bankReference, proofUrl = null) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // [H4 HARDENING] Perform row locking to prevent concurrent status updates
      const payout = await payoutModel.findByIdForUpdate(payoutId, connection);
      if (!payout) throw new Error('Payout record not found.');
      if (payout.status !== 'pending') {
        throw new Error(
          `Cannot mark payout as paid. Current status: ${payout.status}`
        );
      }

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

  async acknowledgePayout(ownerId, payoutId) {
    const history = await payoutModel.findByOwnerId(ownerId);
    const payout = history.find((p) => String(p.id) === String(payoutId));
    if (!payout) throw new Error('Payout not found or access denied');
    if (payout.status !== 'paid')
      throw new Error('Only paid payouts can be acknowledged');

    await payoutModel.acknowledge(payoutId);
    return true;
  }

  async disputePayout(ownerId, payoutId, reason) {
    const history = await payoutModel.findByOwnerId(ownerId);
    const payout = history.find((p) => String(p.id) === String(payoutId));
    if (!payout) throw new Error('Payout not found or access denied');
    if (payout.status !== 'paid')
      throw new Error('Only paid payouts can be disputed');

    await payoutModel.dispute(payoutId, reason);
    return true;
  }

  async getPayoutDetails(ownerId, payoutId) {
    // 1. Verify payout belongs to the requesting owner
    const payouts = await payoutModel.findByOwnerId(ownerId);
    const payout = payouts.find((p) => String(p.id) === String(payoutId));

    if (!payout) {
      throw new Error('Payout not found or access denied');
    }

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

  async exportPayoutCSV(ownerId, payoutId) {
    const details = await this.getPayoutDetails(ownerId, payoutId);

    // Helper to escape CSV values (prevents injection and formatting breaks)
    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = [
      [
        'Property',
        'Unit',
        'Type',
        'Description',
        'Date',
        'Income (LKR)',
        'Expense (LKR)',
      ].map(escapeCSV),
    ];

    // Income Rows
    details.income.forEach((item) => {
      const type =
        item.invoice_type === 'rent'
          ? 'Rent'
          : item.invoice_type === 'late_fee'
            ? 'Late Fee'
            : item.invoice_type.charAt(0).toUpperCase() +
              item.invoice_type.slice(1);

      const description =
        item.invoice_description || `${type} for ${item.month}/${item.year}`;

      rows.push([
        escapeCSV(item.property_name),
        escapeCSV(item.unit_number),
        escapeCSV(type),
        escapeCSV(description),
        escapeCSV(item.payment_date),
        escapeCSV(fromCents(item.amount).toFixed(2)),
        escapeCSV('0.00'),
      ]);
    });

    // Expense Rows
    details.expenses.forEach((item) => {
      rows.push([
        escapeCSV(item.property_name),
        escapeCSV(item.unit_number),
        escapeCSV('Maintenance'),
        escapeCSV(item.description || item.request_title),
        escapeCSV(item.recorded_date),
        escapeCSV('0.00'),
        escapeCSV(fromCents(item.amount).toFixed(2)),
      ]);
    });

    // Summary Rows
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
      ].map(escapeCSV)
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
      ].map(escapeCSV)
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
      ].map(escapeCSV)
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
      ].map(escapeCSV)
    );

    return rows.map((r) => r.join(',')).join('\n');
  }
}

export default new PayoutService();
