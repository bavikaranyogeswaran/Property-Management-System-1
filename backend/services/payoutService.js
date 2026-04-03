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

    // Overlap Fix: New payout must not end before a previous one ends, 
    // but we can have multiple payouts for different records in the same month.
    const hasOverlap = await payoutModel.checkOverlap(ownerId, startDate, endDate);
    if (hasOverlap) {
      throw new Error('A payout record already exists that covers part of this period.');
    }

    // Use a transaction to ensure payout calculation and record linking are atomic
    const connection = await (await import('../config/db.js')).default.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Calculate within transaction to lock/snapshot records
      const { netPayout, incomeIds, expenseIds } = await payoutModel.calculateNetPayout(ownerId, startDate, endDate, connection);

      if (incomeIds.length === 0 && expenseIds.length === 0) {
          throw new Error('No eligible records found for this payout period.');
      }

      // 2. Create Payout record
      const payoutId = await payoutModel.create({
        ownerId,
        amount: netPayout,
        periodStart: startDate,
        periodEnd: endDate,
      }, connection);

      // 3. Link only the specific IDs that were included in the calculation
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

  async processPayout(ownerId, payoutId) {
    // Verify payout belongs to the requesting owner
    const payouts = await payoutModel.findByOwnerId(ownerId);
    const payout = payouts.find((p) => String(p.payout_id) === String(payoutId));
    
    if (!payout) {
      throw new Error('Payout not found');
    }

    if (payout.status === 'processed') {
      throw new Error('Payout already processed');
    }

    await payoutModel.markAsProcessed(payoutId);
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
    
    // Add summary
    const totalIncome = details.income.reduce((sum, r) => sum + Number(r.amount), 0);
    const totalExpenses = details.expenses.reduce((sum, r) => sum + Number(r.amount), 0);
    
    return {
      ...details,
      summary: {
        totalIncome,
        totalExpenses,
        netPayout: totalIncome - totalExpenses,
        periodStart: payout.periodStart,
        periodEnd: payout.periodEnd,
        status: payout.status
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
    rows.push(['TOTAL INCOME', '', '', '', '', (details.summary.totalIncome / 100).toFixed(2), '']);
    rows.push(['TOTAL EXPENSES', '', '', '', '', '', (details.summary.totalExpenses / 100).toFixed(2)]);
    rows.push(['NET PAYOUT', '', '', '', '', (details.summary.netPayout / 100).toFixed(2), '']);

    return rows.map(r => r.join(',')).join('\n');
  }
}

export default new PayoutService();
