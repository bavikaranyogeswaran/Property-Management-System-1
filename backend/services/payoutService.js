import payoutModel from '../models/payoutModel.js';

class PayoutService {
  async previewPayout(ownerId, startDate, endDate) {
    if (!endDate) {
      throw new Error('End date is required');
    }
    return await payoutModel.calculateNetPayout(ownerId, startDate, endDate);
  }

  async createPayout(ownerId, startDate, endDate) {
    if (!endDate) {
      throw new Error('End date is required');
    }

    const hasOverlap = await payoutModel.checkOverlap(ownerId, startDate, endDate);
    if (hasOverlap) {
      throw new Error('A payout record already exists that covers part of this period.');
    }

    const connection = await (await import('../config/db.js')).default.getConnection();
    try {
      await connection.beginTransaction();

      const { totalGross, totalCommission, totalExpenses, netPayout, incomeIds, expenseIds } = 
        await payoutModel.calculateNetPayout(ownerId, startDate, endDate, connection);

      if (incomeIds.length === 0 && expenseIds.length === 0) {
          throw new Error('No eligible records found for this payout period.');
      }

      const payoutId = await payoutModel.create({
        ownerId,
        grossAmount: totalGross,
        commissionAmount: totalCommission,
        expensesAmount: totalExpenses,
        netAmount: netPayout,
        periodStart: startDate,
        periodEnd: endDate,
      }, connection);

      await payoutModel.linkRecordsToPayout(payoutId, incomeIds, expenseIds, connection);

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
    const [row] = await (await import ('../config/db.js')).default.query("SELECT * FROM owner_payouts WHERE payout_id = ?", [payoutId]);
    if (!row[0]) return null;
    return row[0];
  }

  async markAsPaid(payoutId, treasurerId, bankReference, proofUrl = null) {
      // Logic moved to model for transactional safety if needed, here we just trigger it
      await payoutModel.markAsPaid(payoutId, treasurerId, bankReference, proofUrl);
      return true;
  }

  async acknowledgePayout(ownerId, payoutId) {
    const history = await payoutModel.findByOwnerId(ownerId);
    const payout = history.find(p => String(p.id) === String(payoutId));
    if (!payout) throw new Error('Payout not found or access denied');
    if (payout.status !== 'paid') throw new Error('Only paid payouts can be acknowledged');

    await payoutModel.acknowledge(payoutId);
    return true;
  }

  async disputePayout(ownerId, payoutId, reason) {
    const history = await payoutModel.findByOwnerId(ownerId);
    const payout = history.find(p => String(p.id) === String(payoutId));
    if (!payout) throw new Error('Payout not found or access denied');
    if (payout.status !== 'paid') throw new Error('Only paid payouts can be disputed');

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
        disputeReason: payout.disputeReason
      }
    };
  }

  async exportPayoutCSV(ownerId, payoutId) {
    const details = await this.getPayoutDetails(ownerId, payoutId);
    
    const rows = [
      ['Property', 'Unit', 'Type', 'Description', 'Date', 'Income (LKR)', 'Expense (LKR)'],
    ];

    // Income Rows
    details.income.forEach(item => {
      const type = item.invoice_type === 'rent' ? 'Rent' : 
                   item.invoice_type === 'late_fee' ? 'Late Fee' : 
                   item.invoice_type.charAt(0).toUpperCase() + item.invoice_type.slice(1);
      
      const description = item.invoice_description || `${type} for ${item.month}/${item.year}`;
      
      rows.push([
        item.property_name,
        item.unit_number,
        type,
        description,
        item.payment_date,
        (item.amount / 100).toFixed(2),
        '0.00'
      ]);
    });

    // Expense Rows
    details.expenses.forEach(item => {
      rows.push([
        item.property_name,
        item.unit_number,
        'Maintenance',
        item.description || item.request_title,
        item.recorded_date,
        '0.00',
        (item.amount / 100).toFixed(2)
      ]);
    });

    // Summary Row
    rows.push([]);
    rows.push(['TOTAL RENT COLLECTED', '', '', '', '', (details.summary.totalGross / 100).toFixed(2), '']);
    rows.push(['AGENCY MANAGEMENT FEE', '', '', '', '', '', (details.summary.totalCommission / 100).toFixed(2)]);
    rows.push(['TOTAL EXPENSES (MAINTENANCE)', '', '', '', '', '', (details.summary.totalExpenses / 100).toFixed(2)]);
    rows.push([]);
    rows.push(['NET PAYOUT TO OWNER', '', '', '', '', (details.summary.netPayout / 100).toFixed(2), '']);

    return rows.map(r => r.join(',')).join('\n');
  }
}

export default new PayoutService();
