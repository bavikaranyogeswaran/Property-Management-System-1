import maintenanceRequestModel from '../models/maintenanceRequestModel.js';
import propertyModel from '../models/propertyModel.js';
import notificationModel from '../models/notificationModel.js';
// Assuming userModel exists or we use raw query. Checking userModel first...
import userModel from '../models/userModel.js';

class MaintenanceRequestController {
  async createRequest(req, res) {
    try {
      const { unitId, title, description, priority, images } = req.body;
      const tenantId = req.user.id; // From auth middleware

      // RBAC/Security: Verify tenant currently LEASES this unit
      const leaseModel = (await import('../models/leaseModel.js')).default;
      const activeLease = await leaseModel.findActive(); // This returns ALL active. Too heavy.
      // Better: specialized query or generic findByTenantId and filter.
      const tenantLeases = await leaseModel.findByTenantId(tenantId);
      const isLeased = tenantLeases.some(
        (l) => l.unitId === unitId.toString() && l.status === 'active'
      );

      if (!isLeased) {
        return res
          .status(403)
          .json({
            error:
              'Access denied. You do not have an active lease for this unit.',
          });
      }

      const requestId = await maintenanceRequestModel.create({
        unitId,
        tenantId,
        title,
        description,
        priority,
        priority,
        images,
      });

      // Logic Fix: Notify Owner
      try {
        // Find Owner of the property
        const unitModel = (await import('../models/unitModel.js')).default;
        const unit = await unitModel.findById(unitId);
        if (unit && unit.propertyId) {
          // We need ownerId. propertyModel?
          const propertyModel = (await import('../models/propertyModel.js'))
            .default;
          const property = await propertyModel.findById(unit.propertyId);

          if (property && property.owner_id) {
            await notificationModel.create({
              userId: property.owner_id,
              message: `New Maintenance Request for Unit ${unit.unitNumber}: ${title}`,
              type: 'maintenance',
              severity: 'warning',
            });
          }
        }
      } catch (notifyErr) {
        console.error(
          'Failed to notify owner of maintenance request:',
          notifyErr
        );
      }

      res
        .status(201)
        .json({ message: 'Maintenance request created', requestId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create request' });
    }
  }

  async getRequests(req, res) {
    try {
      // RBAC
      if (req.user.role === 'tenant') {
        const requests = await maintenanceRequestModel.findByTenantId(
          req.user.id
        );
        return res.json(requests);
      } else if (req.user.role === 'owner' || req.user.role === 'treasurer') {
        // Owner sees all requests for their properties?
        // Currently generic findAll for simplicity, or we can filter by owner's properties if we had that logic handy.
        // Assuming "Owner" has global view for this specific single-owner system.
        // Treasurer also needs access to view requests to add costs.
        const requests = await maintenanceRequestModel.findAll();
        return res.json(requests);
      } else {
        return res.status(403).json({ error: 'Access denied' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch requests' });
    }
  }

  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // RBAC: Only Owner (or Lead?) can update status?
      // Treasurer typically just adds costs, but maybe can mark as completed if they pay the invoice?
      if (req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can update status' });
      }

      const updated = await maintenanceRequestModel.updateStatus(id, status);

      // Notification Logic
      if (status === 'completed') {
        // Find all treasurers
        const treasurers = await userModel.findByRole('treasurer');
        const request = await maintenanceRequestModel.findById(id);

        // Notify Treasurers
        for (const treasurer of treasurers) {
          await notificationModel.create({
            userId: treasurer.user_id,
            message: `Maintenance Request '${request.title}' has been completed. Please record final costs.`,
            type: 'maintenance',
          });
        }

        // Notify Tenant
        if (request.tenant_id) {
          await notificationModel.create({
            userId: request.tenant_id,
            message: `Maintenance Request '${request.title}' has been marked as completed.`,
            type: 'maintenance',
          });
        }
      } else if (status === 'in_progress') {
        const request = await maintenanceRequestModel.findById(id);
        if (request && request.tenant_id) {
          await notificationModel.create({
            userId: request.tenant_id,
            message: `Maintenance Request '${request.title}' is now In Progress. Technician assigned.`,
            type: 'maintenance',
          });
        }
      }

      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update status' });
    }
  }

  async createInvoice(req, res) {
    try {
      // RBAC: Owner or Treasurer
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { requestId, amount, dueDate, description } = req.body;
      const request = await maintenanceRequestModel.findById(requestId);
      if (!request)
        return res.status(404).json({ error: 'Maintenance Request not found' });

      // Need lease ID from unit/tenant?
      // Maintenance Request has unitId, tenantId.
      // We need the *Active Lease* for this unit/tenant to link the invoice.
      const leaseModel = (await import('../models/leaseModel.js')).default;
      // Use findByTenantId(request.tenant_id) and filter for active?
      // Or findActive() and filter?
      // Better: 'leaseModel.findActiveByUnitId(request.unitId)'?
      // Currently checkOverlap logic is close.
      // Let's use simple generic fetch:
      const leases = await leaseModel.findByTenantId(request.tenant_id);
      const activeLease = leases.find(
        (l) => l.unitId === request.unit_id.toString() && l.status === 'active'
      );

      if (!activeLease) {
        return res
          .status(400)
          .json({
            error:
              'No active lease found for this tenant/unit. Cannot invoice.',
          });
      }

      const invoiceModel = (await import('../models/invoiceModel.js')).default;

      // Logic Check: Duplicate Billing Prevention
      const proposedDescription =
        description || `Maintenance Bill: ${request.title}`;
      const existingInvoices = await invoiceModel.findByLeaseAndDescription(
        activeLease.id,
        proposedDescription
      );

      if (existingInvoices.length > 0) {
        // Check if any existing invoice was created recently (e.g., today) or if we want to block strictly
        // Strict block: "An invoice with this description already exists."
        // But allow if user explicitly wants to? For now, strict block to be safe.
        return res
          .status(409)
          .json({
            error: 'An invoice for this maintenance request already exists.',
          });
      }

      const invoiceId = await invoiceModel.create({
        leaseId: activeLease.id,
        amount,
        dueDate: dueDate || new Date(),
        description: proposedDescription,
        type: 'maintenance',
      });

      // Notify Tenant
      await notificationModel.create({
        userId: request.tenant_id,
        message: `You have been billed ${amount} for maintenance: ${request.title}`,
        type: 'invoice', // New type support?
      });

      res
        .status(201)
        .json({ message: 'Maintenance Invoice Created', invoiceId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create invoice' });
    }
  }
}

export default new MaintenanceRequestController();
