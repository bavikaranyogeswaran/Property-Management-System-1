import payoutModel from '../models/payoutModel.js';

class PayoutController {
  // 1. Preview (Calculate but don't save)
  async previewPayout(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const ownerId = req.user.id; // Assuming Owner calling

      if (req.user.role !== 'owner') {
        return res
          .status(403)
          .json({ error: 'Only owners can generate their payouts' });
      }

      if (!startDate || !endDate) {
        return res
          .status(400)
          .json({ error: 'Start date and end date required' });
      }

      const calculation = await payoutModel.calculateNetPayout(
        ownerId,
        startDate,
        endDate
      );
      res.json(calculation);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to calculate payout preview' });
    }
  }

  // 2. Create (Calculate and Save)
  async createPayout(req, res) {
    try {
      const { startDate, endDate } = req.body;
      const ownerId = req.user.id;

      if (req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Logic Fix: Prevent Overlapping Payouts
      const hasOverlap = await payoutModel.checkOverlap(
        ownerId,
        startDate,
        endDate
      );
      if (hasOverlap) {
        return res
          .status(400)
          .json({ error: 'A payout record already exists for this period.' });
      }

      const { netPayout } = await payoutModel.calculateNetPayout(
        ownerId,
        startDate,
        endDate
      );

      // Logic: Can we implement a check to ensure we don't pay for the same period twice?
      // For now, simple flow as requested.

      const payoutId = await payoutModel.create({
        ownerId,
        amount: netPayout,
        periodStart: startDate,
        periodEnd: endDate,
      });

      res
        .status(201)
        .json({ message: 'Payout record created', payoutId, netPayout });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create payout record' });
    }
  }

  async getHistory(req, res) {
    try {
      const ownerId = req.user.id;
      if (req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Access denied' });
      }
      const payouts = await payoutModel.findByOwnerId(ownerId);
      res.json(payouts);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  }
}

export default new PayoutController();
