// ============================================================================
//  LEASE CONTROLLER (The Contract Manager)
// ============================================================================
//  This file handles the legal agreements between Owner and Tenant.
//  It creates contracts, renews them, and handles move-outs (termination).
// ============================================================================

import leaseModel from '../models/leaseModel.js';
import unitModel from '../models/unitModel.js';
import leaseService from '../services/leaseService.js';

class LeaseController {
  async getLeases(req, res) {
    try {
      // RBAC: Owner sees all (conceptually their own), Treasurer sees ASSIGNED only.
      // Tenant sees their own.
      if (req.user.role === 'owner') {
        const results = await leaseModel.findAll();
        res.json(results);
      } else if (req.user.role === 'treasurer') {
        const results = await leaseModel.findAll();
        // Filter by assigned
        const staffModel = (await import('../models/staffModel.js')).default;
        const assigned = await staffModel.getAssignedProperties(req.user.id);
        const assignedIds = assigned.map((p) => p.property_id.toString());

        const filtered = results.filter((l) =>
          assignedIds.includes(l.propertyId.toString())
        );
        res.json(filtered);
      } else if (req.user.role === 'tenant') {
        const results = await leaseModel.findByTenantId(req.user.id);
        res.json(results);
      } else {
        res.status(403).json({ error: 'Access denied' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getLeaseById(req, res) {
    try {
      const { id } = req.params;
      const lease = await leaseModel.findById(id);
      if (!lease) {
        return res.status(404).json({ error: 'Lease not found' });
      }

      // RBAC check
      if (
        req.user.role !== 'owner' &&
        req.user.role !== 'treasurer' &&
        req.user.role === 'tenant' &&
        lease.tenantId !== req.user.id.toString()
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(lease);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  //  CREATE LEASE: Signing a new contract with a tenant.
  async createLease(req, res) {
    try {
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied.' });
      }

      const {
        tenantId,
        unitId,
        startDate,
        endDate,
        monthlyRent,
        securityDeposit,
      } = req.body;

      if (!tenantId || !unitId || !startDate || !endDate || !monthlyRent) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      // Delegate to LeaseService
      const leaseId = await leaseService.createLease({
        tenantId,
        unitId,
        startDate,
        endDate,
        monthlyRent,
        securityDeposit,
      });

      res
        .status(201)
        .json({ id: leaseId, message: 'Lease created successfully' });
    } catch (error) {
      console.error('Create Lease Error:', error);
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

      if (!newEndDate) {
        return res.status(400).json({ error: 'New end date is required' });
      }

      await leaseService.renewLease(id, newEndDate, newMonthlyRent);

      res.json({ message: 'Lease renewed successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async refundDeposit(req, res) {
    try {
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const { id } = req.params;
      const { amount } = req.body; // Refund Amount

      if (!amount || amount <= 0) {
        return res
          .status(400)
          .json({ error: 'Valid refund amount is required' });
      }

      const result = await leaseService.refundDeposit(id, amount);
      res.json({ message: 'Deposit refunded successfully', ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  //  TERMINATE LEASE: Ending the contract early or moving out.
  async terminateLease(req, res) {
    try {
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const { id } = req.params;
      const { terminationDate } = req.body;

      if (!terminationDate) {
        return res.status(400).json({ error: 'Termination date is required' });
      }

      // Logic: Update Lease End Date, Set Status to Ended, Free up Unit
      // We can reuse logic or call service.
      // leaseService.terminateLease is not defined yet, let's implement inline or add to service.
      // Better to add to service for atomicity.
      const result = await leaseService.terminateLease(id, terminationDate);
      res.json({ message: 'Lease terminated successfully', ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new LeaseController();
