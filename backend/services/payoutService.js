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
}

export default new PayoutService();
