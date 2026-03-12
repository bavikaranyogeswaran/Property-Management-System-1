import payoutModel from '../models/payoutModel.js';

class PayoutService {
  async previewPayout(ownerId, startDate, endDate) {
    if (!startDate || !endDate) {
      throw new Error('Start date and end date are required');
    }
    return await payoutModel.calculateNetPayout(ownerId, startDate, endDate);
  }

  async createPayout(ownerId, startDate, endDate) {
    if (!startDate || !endDate) {
      throw new Error('Start date and end date are required');
    }

    // Logic Fix: Prevent Overlapping Payouts
    const hasOverlap = await payoutModel.checkOverlap(ownerId, startDate, endDate);
    if (hasOverlap) {
      throw new Error('A payout record already exists for this period.');
    }

    const { netPayout } = await payoutModel.calculateNetPayout(ownerId, startDate, endDate);

    const payoutId = await payoutModel.create({
      ownerId,
      amount: netPayout,
      periodStart: startDate,
      periodEnd: endDate,
    });

    return { payoutId, netPayout };
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
