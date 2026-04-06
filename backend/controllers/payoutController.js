import payoutService from '../services/payoutService.js';
import authorizationService from '../services/authorizationService.js';

class PayoutController {
  // 1. Preview (Calculate but don't save)
  async previewPayout(req, res) {
    try {
      const { ownerId, startDate, endDate } = req.query;

      if (req.user.role !== 'treasurer') {
        return res
          .status(403)
          .json({ error: 'Access denied: Only treasurers can generate payouts' });
      }

      if (!ownerId || !endDate) {
        return res
          .status(400)
          .json({ error: 'Owner ID and End date are required' });
      }

      // [HARDENED] Verify Staff Assignment
      if (!await authorizationService.canAccessOwner(req.user.id, req.user.role, ownerId)) {
        return res.status(403).json({ error: 'Access denied: You are not assigned to any properties for this owner' });
      }

      const selection = {
        incomeIds: req.query.incomeIds ? (Array.isArray(req.query.incomeIds) ? req.query.incomeIds : [req.query.incomeIds]) : null,
        expenseIds: req.query.expenseIds ? (Array.isArray(req.query.expenseIds) ? req.query.expenseIds : [req.query.expenseIds]) : null
      };

      const calculation = await payoutService.previewPayout(
        ownerId,
        startDate,
        endDate,
        selection
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
      const { ownerId, startDate, endDate, selection } = req.body;

      if (req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied: Only treasurers can generate payouts' });
      }

      if (!ownerId) {
          return res.status(400).json({ error: 'Owner ID is required' });
      }

      // [HARDENED] Verify Staff Assignment
      if (!await authorizationService.canAccessOwner(req.user.id, req.user.role, ownerId)) {
        return res.status(403).json({ error: 'Access denied: You are not assigned to any properties for this owner' });
      }

      const { payoutId, netPayout } = await payoutService.createPayout(
        ownerId,
        startDate,
        endDate,
        selection
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
      const ownerId = req.query.ownerId || req.user.id;
      
      // [HARDENED] Assignment Check
      if (!await authorizationService.canAccessOwner(req.user.id, req.user.role, ownerId)) {
          return res.status(403).json({ error: 'Access denied: You do not have permission to view this owner\'s data' });
      }

      const payouts = await payoutService.getHistory(ownerId);
      res.json(payouts);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  }

  async markAsPaid(req, res) {
    try {
      const { id } = req.params;
      const { bankReference, proofUrl } = req.body;

      if (req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied: Only treasurers can process payments' });
      }

      // [HARDENED] Verify Access to Payout Resource
      const fullPayout = await payoutService.getPayoutById(id);
      if (!fullPayout) return res.status(404).json({ error: 'Payout not found' });

      if (!await authorizationService.canAccessOwner(req.user.id, req.user.role, fullPayout.owner_id)) {
          return res.status(403).json({ error: 'Access denied: You are not assigned to this property owner' });
      }

      if (!bankReference) {
          return res.status(400).json({ error: 'Bank reference is required for payment verification' });
      }

      await payoutService.markAsPaid(id, req.user.id, bankReference, proofUrl);
      res.json({ message: 'Payout marked as paid and sent to owner for acknowledgment' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to process payout' });
    }
  }

  async getPayoutDetails(req, res) {
    try {
      const { id } = req.params;
      // Get internal details then check ownerId
      const fullPayout = await payoutService.getPayoutById(id);
      if (!fullPayout) return res.status(404).json({ error: 'Payout not found' });

      // [HARDENED] RBAC & Assignment check
      if (!await authorizationService.canAccessOwner(req.user.id, req.user.role, fullPayout.owner_id)) {
          return res.status(403).json({ error: 'Access denied: You are not authorized to view these details' });
      }

      const details = await payoutService.getPayoutDetails(fullPayout.owner_id, id);
      res.json(details);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }

  async acknowledgePayout(req, res) {
    try {
        if (req.user.role !== 'owner') return res.status(403).json({ error: 'Access denied' });
        const { id } = req.params;
        await payoutService.acknowledgePayout(req.user.id, id);
        res.json({ message: 'Payout acknowledged successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
  }

  async disputePayout(req, res) {
    try {
        if (req.user.role !== 'owner') return res.status(403).json({ error: 'Access denied' });
        const { id } = req.params;
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ error: 'Reason for dispute is required' });
        await payoutService.disputePayout(req.user.id, id, reason);
        res.json({ message: 'Payout marked as disputed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
  }

  async exportPayoutCSV(req, res) {
    try {
      const { id } = req.params;
      const fullPayout = await payoutService.getPayoutById(id);
      if (!fullPayout) return res.status(404).json({ error: 'Payout not found' });

      // [HARDENED] Assignment Check
      if (!await authorizationService.canAccessOwner(req.user.id, req.user.role, fullPayout.owner_id)) {
          return res.status(403).json({ error: 'Access denied: You are not authorized to export this data' });
      }

      const csv = await payoutService.exportPayoutCSV(fullPayout.owner_id, id);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=payout_reconciliation_${id}.csv`);
      res.status(200).send(csv);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to export CSV' });
    }
  }
}

export default new PayoutController();
