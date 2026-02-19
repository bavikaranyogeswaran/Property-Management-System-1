// ============================================================================
//  MAINTENANCE CONTROLLER (The Repair Shop)
// ============================================================================
//  This file handles complaints about broken things.
//  Tenants report issues ("Leaky faucet"), and Owners/Treasurers fix them.
// ============================================================================

import maintenanceService from '../services/maintenanceService.js';

class MaintenanceRequestController {
  //  REPORT ISSUE: Tenant says "Something is broken".
  async createRequest(req, res) {
    try {
      const requestId = await maintenanceService.createRequest(req.body, req.user.id);
      res
        .status(201)
        .json({ message: 'Maintenance request created', requestId });
    } catch (error) {
      console.error(error);
      if (error.message.includes('Access denied')) {
          return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to create request' });
    }
  }

  async getRequests(req, res) {
    try {
      const requests = await maintenanceService.getRequests(req.user);
      return res.json(requests);
    } catch (error) {
      console.error(error);
       if (error.message.includes('Access denied')) {
          return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to fetch requests' });
    }
  }

  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const updated = await maintenanceService.updateStatus(id, status, req.user);
      res.json(updated);
    } catch (error) {
      console.error(error);
      if (error.message.includes('Only owners')) {
           return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to update status' });
    }
  }

  //  BILL TENANT: If the damage was the tenant's fault, we send them a bill (Invoice).
  async createInvoice(req, res) {
    try {
      const invoiceId = await maintenanceService.createInvoice(req.body, req.user);
      res
        .status(201)
        .json({ message: 'Maintenance Invoice Created', invoiceId });
    } catch (error) {
      console.error(error);
      if (error.message.includes('Access denied')) {
           return res.status(403).json({ error: error.message });
      }
      if (error.message.includes('not found') || error.message.includes('No active lease')) {
           return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('already exists')) {
           return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to create invoice' });
    }
  }
}

export default new MaintenanceRequestController();
