
import leaseService from '../services/leaseService.js';


class LeaseController {
  async getLeases(req, res) {
    try {
      const results = await leaseService.getLeases(req.user);
      res.json(results);
    } catch (error) {
      console.error(error); 
      if (error.message.includes('Access denied')) {
           return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  }

  async getLeaseById(req, res) {
    try {
      const { id } = req.params;
      const lease = await leaseService.getLeaseById(id, req.user);
      res.json(lease);
    } catch (error) {
      if (error.message === 'Lease not found') return res.status(404).json({ error: error.message });
      if (error.message.includes('Access denied')) return res.status(403).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  //  CREATE LEASE
  async createLease(req, res) {
    try {
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied.' });
      }

      const leaseId = await leaseService.createLease(req.body, null, req.user);
      res
        .status(201)
        .json({ id: leaseId, message: 'Lease created successfully' });
    } catch (error) {
      console.error('Create Lease Error:', error);
      if (error.message.includes('required') || error.message.includes('Invalid') || error.message.includes('greater than 0')) {
          return res.status(400).json({ error: error.message });
      }
       if (error.message.includes('Unit not found')) {
          return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('Unit is already leased') || error.message.includes('Unit is currently under maintenance')) {
          return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  }

  async signLease(req, res) {
    try {
      const { id } = req.params;
      const result = await leaseService.signLease(id, req.user);
      res.json({ message: 'Lease signed successfully', status: result.status });
    } catch (error) {
      console.error('Sign Lease Error:', error);
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('draft')) return res.status(400).json({ error: error.message });
      if (error.message.includes('available') || error.message.includes('already leased')) return res.status(409).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async renewLease(req, res) {
    try {
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied.' });
      }

      const { id } = req.params;
      const { newEndDate, newMonthlyRent } = req.body;

      await leaseService.renewLease(id, newEndDate, newMonthlyRent);
      res.json({ message: 'Lease renewed successfully' });
    } catch (error) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('Only active')) return res.status(400).json({ error: error.message });
      if (error.message.includes('overlap') || error.message.includes('already booked')) return res.status(409).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async refundDeposit(req, res) {
    try {
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const { id } = req.params;
      const { amount, notes } = req.body; 

      const result = await leaseService.refundDeposit(id, amount, notes, req.user);
      res.json({ message: 'Deposit refund requested successfully', ...result });
    } catch (error) {
       if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
       if (error.message.includes('exceed') || error.message.includes('required')) return res.status(400).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async approveRefund(req, res) {
    try {
      if (req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can approve refunds.' });
      }
      const { id } = req.params;
      const result = await leaseService.approveRefund(id, req.user);
      res.json({ message: 'Refund approved and executed successfully', ...result });
    } catch (error) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async disputeRefund(req, res) {
    try {
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const { id } = req.params;
      const { notes } = req.body;
      const result = await leaseService.disputeRefund(id, notes, req.user);
      res.json({ message: 'Refund request marked as disputed', ...result });
    } catch (error) {
       if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async terminateLease(req, res) {
    try {
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const { id } = req.params;
      const { terminationDate, terminationFee } = req.body; // Fee optional

      const result = await leaseService.terminateLease(id, terminationDate, terminationFee, req.user);
      res.json({ message: 'Lease terminated successfully', ...result });
    } catch (error) {
       if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async updateLeaseDocument(req, res) {
    try {
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const { id } = req.params;
      const { documentUrl } = req.body;

      if (!documentUrl) {
        return res.status(400).json({ error: 'documentUrl is required' });
      }

      await leaseService.updateLeaseDocument(id, documentUrl);
      res.json({ message: 'Lease document updated successfully', documentUrl });
    } catch (error) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async updateNoticeStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      await leaseService.updateNoticeStatus(id, status, req.user);
      res.json({ message: 'Notice status updated successfully', status });
    } catch (error) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('Access denied')) return res.status(403).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async addRentAdjustment(req, res) {
    try {
      const { id } = req.params;
      const { effectiveDate, newMonthlyRent, notes } = req.body;

      if (!effectiveDate || !newMonthlyRent) {
        return res.status(400).json({ error: 'effectiveDate and newMonthlyRent are required' });
      }

      const adjustmentId = await leaseService.addRentAdjustment(id, {
        effectiveDate,
        newMonthlyRent,
        notes
      }, req.user);

      res.status(201).json({ 
        message: 'Rent adjustment added successfully', 
        adjustmentId 
      });
    } catch (error) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('Access denied')) return res.status(403).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async getRentAdjustments(req, res) {
    try {
      const { id } = req.params;
      const adjustments = await leaseService.getRentAdjustments(id, req.user);
      res.json(adjustments);
    } catch (error) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('Access denied')) return res.status(403).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async finalizeCheckout(req, res) {
    try {
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const { id } = req.params;
      const result = await leaseService.finalizeLeaseCheckout(id, req.user);
      res.json({ message: 'Lease checkout finalized successfully', ...result });
    } catch (error) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('Only expired')) return res.status(400).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

}

export default new LeaseController();
