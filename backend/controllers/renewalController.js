import renewalService from '../services/renewalService.js';

class RenewalController {
  async getRequests(req, res) {
    try {
      const results = await renewalService.getRequests(req.user);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async proposeTerms(req, res) {
    try {
      const { id } = req.params;
      const { proposedMonthlyRent, proposedEndDate, notes } = req.body;

      if (!proposedMonthlyRent || !proposedEndDate) {
        return res
          .status(400)
          .json({ error: 'Proposed rent and end date are required' });
      }

      await renewalService.proposeTerms(
        id,
        {
          proposedMonthlyRent,
          proposedEndDate,
          notes,
        },
        req.user
      );

      res.json({ message: 'Renewal terms proposed successfully' });
    } catch (error) {
      if (error.message.includes('not found'))
        return res.status(404).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async approveRenewal(req, res) {
    try {
      const { id } = req.params;
      const result = await renewalService.approve(id, req.user);
      res.json({
        message: 'Renewal approved and draft lease created',
        ...result,
      });
    } catch (error) {
      if (error.message.includes('not found'))
        return res.status(404).json({ error: error.message });
      if (error.message.includes('required'))
        return res.status(400).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async rejectRenewal(req, res) {
    try {
      const { id } = req.params;
      await renewalService.reject(id, req.user);
      res.json({ message: 'Renewal request rejected' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new RenewalController();
