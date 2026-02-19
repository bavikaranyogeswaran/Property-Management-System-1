
import leaseService from '../services/leaseService.js';
// Needed for getLeaseById RBAC check if not moved to service completely?
// Actually, getLeaseById logic in controller checked user role to allow viewing.
// Ideally service should handle "getLeaseById(id, user)" and throw if denied.
// Let's check my previous view of leaseService. It didn't have getLeaseById.
// I should add it to service or keep strictly read-logic in controller?
// "Strict Layered" means service handles logic. Controller handles HTTP.
// Access Control IS business logic.
// I will keep basic ID fetch in controller but RBAC is logic.
// However, standard pattern: Controller calls Service. Service checks RBAC.
// For now, I will keep getLeaseById fetching in controller if service doesn't have it, 
// OR I will add getById to service.
// The service I viewed (lines 1-588) did NOT have getById.
// I will implement getLeaseById in Controller using model for now (Read-Only is usually ok for simple CRUD, 
// but Strict Architecture prefers Service).
// Checking previous audit: "Move filtering logic to LeaseService.js".
// I did move 'getLeases' filtering.
// I will keep 'getLeaseById' simple in Controller effectively acting as a proxy to Model for now, 
// OR better, move it to Service. 
// I'll add `getLeaseById` to service in a follow up or just use Model here for read?
// User asked to remove ALL model imports. So I MUST move `getById` to Service or reuse Model via Service.
// I will use `leaseService.getLeases` for list.
// I will add `getLeaseById` to Service now via `replace_file_content`? No, too risky with partial file.
// I will rely on `leaseModel` import in Controller for READs if I must, BUT user said "Not all business logic inside service layer".
// The safest bet for "100%" is to add `getById` to Service.
// I'll add logic to Service in next step if needed, or I can define it here in Controller if I import model?
// Wait, target is ZERO model imports in Controller.
// So I MUST add `getById` to Service.
// I will add it to the Service first.

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
      // Temporary: We need to import model if service doesn't have it
      // But we want to remove model imports.
      // I'll assume I can add it to service in next step.
      // For now, I'll return 501 Not Implemented or try to fetch via service if I add it.
      // Actually, I can add `getLeaseById` to `LeaseService` using `replace_file_content` right now.
      
      const { id } = req.params;
      const lease = await leaseService.getLeaseById(id, req.user); // Pending implementation
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

      const leaseId = await leaseService.createLease(req.body);
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
      const { amount } = req.body; 

      const result = await leaseService.refundDeposit(id, amount);
      res.json({ message: 'Deposit refunded successfully', ...result });
    } catch (error) {
       if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
       if (error.message.includes('exceed') || error.message.includes('required')) return res.status(400).json({ error: error.message });
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

      const result = await leaseService.terminateLease(id, terminationDate, terminationFee);
      res.json({ message: 'Lease terminated successfully', ...result });
    } catch (error) {
       if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
}

export default new LeaseController();
