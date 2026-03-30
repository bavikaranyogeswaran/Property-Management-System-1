import payoutService from '../services/payoutService.js';

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

      if (!endDate) {
        return res
          .status(400)
          .json({ error: 'End date is required' });
      }

      const calculation = await payoutService.previewPayout(
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

      const { payoutId, netPayout } = await payoutService.createPayout(
        ownerId,
        startDate,
        endDate
      );

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
      const payouts = await payoutService.getHistory(ownerId);
      res.json(payouts);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  }

  async processPayout(req, res) {
    try {
      if (req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { id } = req.params;

      await payoutService.processPayout(req.user.id, id);
      res.json({ message: 'Payout marked as processed' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to process payout' });
    }
  }
}

export default new PayoutController();
