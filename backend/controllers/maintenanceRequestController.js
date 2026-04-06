// ============================================================================
//  MAINTENANCE CONTROLLER (The Repair Shop)
// ============================================================================
//  This file handles complaints about broken things.
//  Tenants report issues ("Leaky faucet"), and Owners/Treasurers fix them.
// ============================================================================

import maintenanceService from '../services/maintenanceService.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

class MaintenanceRequestController {
  //  REPORT ISSUE: Tenant says "Something is broken".
  createRequest = catchAsync(async (req, res, next) => {
    const data = { ...req.body };
    if (req.files) {
      data.images = req.files.map((file) => file.path || file.secure_url);
    }
    const requestId = await maintenanceService.createRequest(data, req.user.id);
    res.status(201).json({ message: 'Maintenance request created', requestId });
  });

  getRequests = catchAsync(async (req, res, next) => {
    const requests = await maintenanceService.getRequests(req.user);
    return res.json(requests);
  });

  updateStatus = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { status } = req.body;

    const updated = await maintenanceService.updateStatus(id, status, req.user);
    res.json(updated);
  });

  //  BILL TENANT: If the damage was the tenant's fault, we send them a bill (Invoice).
  createInvoice = catchAsync(async (req, res, next) => {
    const invoiceId = await maintenanceService.createInvoice(
      req.body,
      req.user
    );
    res.status(201).json({ message: 'Maintenance Invoice Created', invoiceId });
  });
}

export default new MaintenanceRequestController();
