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
  // REPORT ISSUE: Tenant says "Something is broken".
  createRequest = catchAsync(async (req, res, next) => {
    const data = { ...req.body };
    // 1. [TRANSFORMATION] Map uploaded evidence photos to the data payload
    if (req.files) data.images = req.files.map((file) => file.url);

    // 2. [DELEGATION] Orchestration: Persist the ticket and notify property staff
    const requestId = await maintenanceService.createRequest(data, req.user.id);
    res.status(201).json({ message: 'Maintenance request created', requestId });
  });

  // GET REQUESTS: Lists all tickets (RBAC-aware).
  getRequests = catchAsync(async (req, res, next) => {
    // 1. [DELEGATION] Visibility Logic: Filter by property assignment (Staff) or ownership (Tenant)
    const requests = await maintenanceService.getRequests(req.user);
    return res.json(requests);
  });

  // UPDATE STATUS: Moves a ticket from 'reported' to 'scheduled', 'fixed', or 'cancelled'.
  updateStatus = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    // 1. [DELEGATION] State Transition: Update status and record staff notes/timeline entry
    const updated = await maintenanceService.updateStatus(
      id,
      req.body,
      req.user
    );
    res.json(updated);
  });

  // BILL TENANT: If the damage was the tenant's fault, we generate a formal debt in the invoice ledger.
  createInvoice = catchAsync(async (req, res, next) => {
    // 1. [DELEGATION] Billing Logic: Verify lease existence and create the financial record
    const invoiceId = await maintenanceService.createInvoice(
      req.body,
      req.user
    );
    res.status(201).json({ message: 'Maintenance Invoice Created', invoiceId });
  });
}

export default new MaintenanceRequestController();
