// ============================================================================
//  UNIT CONTROLLER (The Apartment Manager)
// ============================================================================
//  This file manages the individual rooms or houses (Units).
//  It tracks if they are vacant or occupied and who lives there.
// ============================================================================

import unitModel from '../models/unitModel.js';
import propertyModel from '../models/propertyModel.js';

class UnitController {
  // ADD UNIT: Adding a new room/house to the system.
  async createUnit(req, res) {
    try {
      // 1. [SECURITY] Ownership check: verify the property belongs to the requesting owner
      if (req.body.propertyId) {
        const property = await propertyModel.findById(req.body.propertyId);
        if (!property)
          return res.status(404).json({ error: 'Property not found' });
        if (String(property.ownerId) !== String(req.user.id)) {
          return res
            .status(403)
            .json({ error: 'You do not own this property' });
        }
      }

      // 2. [DELEGATION] Vault Persistence
      const unit = await unitModel.create(req.body);
      const newUnit = await unitModel.findById(unit);
      res.status(201).json(newUnit);
    } catch (error) {
      if (
        error.code === 'ER_DUP_ENTRY' ||
        error.message.includes('Duplicate entry')
      ) {
        return res
          .status(409)
          .json({ error: 'Unit number already exists in this property' });
      }
      res.status(500).json({ error: error.message });
    }
  }

  // GET UNITS: Lists all apartments, potentially filtered by staff assignments.
  async getUnits(req, res) {
    try {
      // 1. [DATA] Collection Retrieval
      const units = await unitModel.findAll();
      const isPublic = req.query.public === 'true';

      // 2. [SECURITY] Portfolio visibility filter for staff members
      if (!isPublic && req.user && req.user.role === 'treasurer') {
        const staffModel = (await import('../models/staffModel.js')).default;
        const assigned = await staffModel.getAssignedProperties(req.user.id);
        const assignedIds = assigned.map((p) => p.property_id.toString());

        const filtered = units.filter((u) =>
          assignedIds.includes(u.propertyId.toString())
        );
        return res.json(filtered);
      }

      res.json(units);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // GET UNIT BY ID: Fetch detail view for a specific apartment.
  async getUnitById(req, res) {
    try {
      // 1. [DATA] Resolution
      const unit = await unitModel.findById(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Unit not found' });
      res.json(unit);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // UPDATE UNIT: Modifies room details (e.g., area, status, descriptive tags).
  async updateUnit(req, res) {
    try {
      // 1. [SECURITY] Resolve unit and verify ownership/access
      const unit = await unitModel.findById(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Unit not found' });

      if (req.user.role === 'owner') {
        const property = await propertyModel.findById(unit.propertyId);
        if (!property || String(property.ownerId) !== String(req.user.id)) {
          return res
            .status(403)
            .json({
              error: 'You do not own the property associated with this unit.',
            });
        }
      }

      // 2. [DELEGATION] State Persistence
      const success = await unitModel.update(req.params.id, req.body);
      if (!success)
        return res.status(404).json({ error: 'Unit not found or no changes' });
      const updated = await unitModel.findById(req.params.id);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // DELETE UNIT: Archives a unit (soft delete).
  async deleteUnit(req, res) {
    try {
      const unit = await unitModel.findById(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Unit not found' });

      // 1. [SECURITY] Authorization Guard
      if (req.user.role === 'owner') {
        const property = await propertyModel.findById(unit.propertyId);
        if (!property || String(property.ownerId) !== String(req.user.id)) {
          return res
            .status(403)
            .json({
              error: 'You do not own the property associated with this unit.',
            });
        }
      }

      // 2. [VALIDATION] Integrity Check: Block archiving if there's an active financial liability (lease)
      const leaseModel = (await import('../models/leaseModel.js')).default;
      const activeLeaseCount = await leaseModel.countActiveByUnitId(
        req.params.id
      );
      if (activeLeaseCount > 0) {
        return res
          .status(400)
          .json({
            error: 'Cannot archive unit with active or pending leases.',
          });
      }

      // 3. [DELEGATION] Purge Logic
      const success = await unitModel.delete(req.params.id);
      if (!success) return res.status(404).json({ error: 'Unit not found' });
      res.json({ message: 'Unit archived successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // MARK AVAILABLE: Releases a unit from 'maintenance' back into the pool.
  async markAvailable(req, res) {
    try {
      const unit = await unitModel.findById(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Unit not found' });

      // 1. [SECURITY] Guard
      if (req.user.role === 'owner') {
        const property = await propertyModel.findById(unit.propertyId);
        if (!property || String(property.ownerId) !== String(req.user.id)) {
          return res
            .status(403)
            .json({
              error: 'You do not own the property associated with this unit.',
            });
        }
      }

      // 2. [VALIDATION] State Check: Only 'maintenance' units can be unlocked manually here
      if (unit.status !== 'maintenance') {
        return res
          .status(400)
          .json({
            error: `Unit is currently '${unit.status}', not 'maintenance'.`,
          });
      }

      // 3. [VALIDATION] Safety check: ensure no active lease is running on this unit
      const leaseModel = (await import('../models/leaseModel.js')).default;
      const activeLeaseCount = await leaseModel.countActiveByUnitId(
        req.params.id
      );
      if (activeLeaseCount > 0) {
        return res
          .status(409)
          .json({
            error:
              'Cannot mark unit as available — it still has an active lease.',
          });
      }

      // 4. [DELEGATION] State Transition
      await unitModel.update(req.params.id, { status: 'available' });
      res.json({
        message: 'Unit marked as available successfully',
        unitId: req.params.id,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // CLEAR TURNOVER: Confirms that an inspection/cleaning is complete after a tenant moved out.
  async clearTurnover(req, res) {
    try {
      const unit = await unitModel.findById(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Unit not found' });

      // 1. [SECURITY] Resolve access rights (Owner or assigned Staff)
      if (req.user.role === 'owner') {
        const property = await propertyModel.findById(unit.propertyId);
        if (!property || String(property.ownerId) !== String(req.user.id)) {
          return res
            .status(403)
            .json({
              error: 'You do not own the property associated with this unit.',
            });
        }
      } else if (req.user.role === 'treasurer') {
        const staffModel = (await import('../models/staffModel.js')).default;
        const isAssigned = await staffModel.isStaffAssignedToProperty(
          req.user.id,
          unit.propertyId
        );
        if (!isAssigned) {
          return res
            .status(403)
            .json({ error: 'You are not assigned to manage this property.' });
        }
      }

      // 2. [VALIDATION] Check if it's actually locked in a turnover state
      if (unit.isTurnoverCleared && unit.status !== 'maintenance') {
        return res
          .status(400)
          .json({ error: 'Unit does not have a pending turnover clearance.' });
      }

      // 3. [DELEGATION] State Transition: Move to 'reserved' if there's a pipeline lease, otherwise 'available'
      await unitModel.update(req.params.id, {
        isTurnoverCleared: true,
        status:
          unit.futureLeaseCount > 0 || unit.pendingApplicationsCount > 0
            ? 'reserved'
            : 'available',
      });

      res.json({
        message:
          'Turnover cleared successfully. Unit is now ready for the next occupancy.',
        unitId: req.params.id,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new UnitController();
