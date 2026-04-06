import leaseTermService from '../services/leaseTermService.js';

class LeaseTermController {
  async getLeaseTerms(req, res) {
    try {
      const terms = await leaseTermService.getLeaseTerms(req.user);
      res.json(terms);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async createLeaseTerm(req, res) {
    try {
      const id = await leaseTermService.createLeaseTerm(req.body, req.user);
      res.status(201).json({ id, message: 'Lease term created successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateLeaseTerm(req, res) {
    try {
      await leaseTermService.updateLeaseTerm(req.params.id, req.body, req.user);
      res.json({ message: 'Lease term updated successfully' });
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  }

  async deleteLeaseTerm(req, res) {
    try {
      await leaseTermService.deleteLeaseTerm(req.params.id, req.user);
      res.json({ message: 'Lease term deleted successfully' });
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  }
}

export default new LeaseTermController();
