// ============================================================================
//  UNIT CONTROLLER (The Apartment Manager)
// ============================================================================
//  This file manages the individual rooms or houses (Units).
//  It tracks if they are vacant or occupied and who lives there.
// ============================================================================

import unitModel from '../models/unitModel.js';
import propertyModel from '../models/propertyModel.js';

class UnitController {
  //  ADD UNIT: Adding a new room/house to the system.
  async createUnit(req, res) {
    try {
      // Ownership check: verify the property belongs to the requesting owner
      if (req.user.role === 'owner' && req.body.propertyId) {
        const property = await propertyModel.findById(req.body.propertyId);
        if (!property) {
          return res.status(404).json({ error: 'Property not found' });
        }
        if (String(property.ownerId) !== String(req.user.id)) {
          return res.status(403).json({ error: 'You do not own this property' });
        }
      }

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

  async getUnits(req, res) {
    try {
      const units = await unitModel.findAll();
      const isPublic = req.query.public === 'true';

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

  async getUnitById(req, res) {
    try {
      const unit = await unitModel.findById(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Unit not found' });
      res.json(unit);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateUnit(req, res) {
    try {
      // 1. Fetch unit to check ownership
      const unit = await unitModel.findById(req.params.id);
      if (!unit) {
        return res.status(404).json({ error: 'Unit not found' });
      }

      // 2. Ownership check
      if (req.user.role === 'owner') {
        const property = await propertyModel.findById(unit.propertyId);
        if (!property || String(property.ownerId) !== String(req.user.id)) {
          return res.status(403).json({ error: 'You do not own the property associated with this unit.' });
        }
      }

      const success = await unitModel.update(req.params.id, req.body);
      if (!success)
        return res.status(404).json({ error: 'Unit not found or no changes' });
      const updated = await unitModel.findById(req.params.id);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async deleteUnit(req, res) {
    try {
      const unit = await unitModel.findById(req.params.id);
      if (!unit) {
        return res.status(404).json({ error: 'Unit not found' });
      }

      // 1. Ownership check
      if (req.user.role === 'owner') {
        const property = await propertyModel.findById(unit.propertyId);
        if (!property || String(property.ownerId) !== String(req.user.id)) {
          return res.status(403).json({ error: 'You do not own the property associated with this unit.' });
        }
      }

      // 2. Lease check: Block if any active or pending leases exist
      const leaseModel = (await import('../models/leaseModel.js')).default;
      const activeLeaseCount = await leaseModel.countActiveByUnitId(req.params.id);
      if (activeLeaseCount > 0) {
        return res.status(400).json({ 
          error: 'Cannot archive unit with active or pending leases. Please terminate or finish leases first.' 
        });
      }

      const success = await unitModel.delete(req.params.id);
      if (!success) return res.status(404).json({ error: 'Unit not found' });
      res.json({ message: 'Unit archived successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new UnitController();
