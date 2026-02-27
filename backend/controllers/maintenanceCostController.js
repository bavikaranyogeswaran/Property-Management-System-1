import maintenanceCostModel from '../models/maintenanceCostModel.js';

class MaintenanceCostController {
  async addCost(req, res) {
    try {
      const { requestId, amount, description, recordedDate, billToTenant } =
        req.body;

      // RBAC: Owner and Treasurer can add costs
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const costId = await maintenanceCostModel.create({
        requestId,
        amount,
        description,
        recordedDate,
      });

      // Logic Check: Billable Maintenance
      // If flagged, generate an Invoice for the tenant.
      if (billToTenant) {
        try {
          // Get request details to find tenant/unit/lease?
          // maintenanceRequestModel has tenantId and unitId.
          // We need ACTIVE lease to bill against.
          const maintenanceRequestModel = (
            await import('../models/maintenanceRequestModel.js')
          ).default;
          const request = await maintenanceRequestModel.findById(requestId); // Ensure this exists

          if (request && request.tenant_id) {
            // Find active lease for this tenant/unit?
            // invoiceModel needs leaseId.
            const leaseModel = (await import('../models/leaseModel.js')).default;
            // We need to find the lease associated with this request.
            // Usually maintenance is on a unit occupied by tenant.
            // Assuming 'tenant_id' on request is the current tenant.
            // Let's find ACTIVE lease for this tenant and unit.

            // Logic Fix: Correct Method Name & Data Handling
            const leases = await leaseModel.findByTenantId(request.tenant_id);
            // findByTenantId returns an array of mapped objects (id, unitId, etc.)

            // Find active lease for this unit
            const activeLease = leases.find(
              (l) =>
                String(l.unitId) === String(request.unit_id) &&
                l.status === 'active'
            );

            if (activeLease) {
              const invoiceModel = (await import('../models/invoiceModel.js'))
                .default;
              await invoiceModel.create({
                leaseId: activeLease.id, // Mapped model uses 'id'
                amount: amount,
                dueDate: new Date(), // Immediate
                description: `Maintenance Charge: ${description || 'Repair Costs'}`,
                type: 'maintenance', // Logic Fix: Correct Type
              });

              // Logic Fix: In-App Notification
              const notificationModel = (
                await import('../models/notificationModel.js')
              ).default;
              await notificationModel.create({
                userId: request.tenant_id,
                message: `A new maintenance charge of ${amount} has been added to your account.`,
                type: 'invoice',
                severity: 'warning',
              });

              console.log(`Billed Maintenance Cost to Lease ${activeLease.id}`);
            } else {
              console.warn(
                'Cannot bill maintenance: No active lease found for this unit/tenant.'
              );
            }
          }
        } catch (billingErr) {
            console.warn('Silent Failure: Could not auto-generate tenant invoice for maintenance cost.', billingErr);
        }
      }

      res.status(201).json({ message: 'Cost recorded', costId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to record cost' });
    }
  }

  async getCosts(req, res) {
    try {
      const { requestId } = req.query;

      if (req.user.role === 'tenant') {
        const costs = await maintenanceCostModel.findByTenantId(req.user.id);
        return res.json(costs);
      }

      // If no requestId provided, return all costs for Owner/Treasurer (scoped)
      if (!requestId) {
        if (req.user.role === 'owner') {
          const costs = await maintenanceCostModel.findAllWithDetails();
          return res.json(costs);
        } else if (req.user.role === 'treasurer') {
          const costs = await maintenanceCostModel.findByTreasurerId(
            req.user.id
          );
          return res.json(costs);
        }
        return res.status(403).json({ error: 'Access denied' });
      }

      const costs = await maintenanceCostModel.findByRequestId(requestId);
      res.json(costs);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch costs' });
    }
  }

  async deleteCost(req, res) {
    try {
      const { id } = req.params;

      // RBAC: Owner and Treasurer can delete costs
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (req.user.role === 'treasurer') {
        const cost = await maintenanceCostModel.findByIdWithDetails(id);
        if (!cost) return res.status(404).json({ error: 'Cost not found' });

        const staffModel = (await import('../models/staffModel.js')).default;
        const assignments = await staffModel.getAssignedProperties(req.user.id);
        const isAssigned = assignments.some(
          (p) => p.property_id === cost.property_id
        );

        if (!isAssigned) {
          return res
            .status(403)
            .json({
              error: 'Access denied. You are not assigned to this property.',
            });
        }
      }

      const deleted = await maintenanceCostModel.delete(id);
      if (deleted) {
        res.json({ message: 'Cost deleted' });
      } else {
        res.status(404).json({ error: 'Cost not found' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete cost' });
    }
  }
}

export default new MaintenanceCostController();
