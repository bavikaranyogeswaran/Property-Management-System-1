import maintenanceCostModel from '../models/maintenanceCostModel.js';
import { today } from '../utils/dateUtils.js';

class MaintenanceCostController {
  async addCost(req, res) {
    try {
      const {
        requestId,
        amount,
        description,
        recordedDate,
        billTo,
        billToTenant,
      } = req.body;
      const isBillableToTenant = billTo === 'tenant' || billToTenant === true;

      const maintenanceService = (
        await import('../services/maintenanceService.js')
      ).default;

      const { costId, billingSuccess } = await maintenanceService.recordCost(
        {
          requestId,
          amount,
          description,
          recordedDate,
          billTo: billTo || (billToTenant ? 'tenant' : 'owner'),
        },
        req.user
      );

      const response = { message: 'Cost recorded', costId };
      if (isBillableToTenant) {
        response.billingSuccess = billingSuccess;
        if (!billingSuccess) {
          response.billingError = 'No active lease found to bill the tenant.';
        }
      }
      res.status(201).json(response);
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

      if (req.user.role === 'treasurer') {
        const cost = await maintenanceCostModel.findByIdWithDetails(id);
        if (!cost) return res.status(404).json({ error: 'Cost not found' });

        const staffModel = (await import('../models/staffModel.js')).default;
        const assignments = await staffModel.getAssignedProperties(req.user.id);
        const isAssigned = assignments.some(
          (p) => p.property_id === cost.property_id
        );

        if (!isAssigned) {
          return res.status(403).json({
            error: 'Access denied. You are not assigned to this property.',
          });
        }
      }

      const successfullyVoided = await maintenanceCostModel.void(id);
      if (successfullyVoided) {
        res.json({ message: 'Cost marked as voided' });
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
