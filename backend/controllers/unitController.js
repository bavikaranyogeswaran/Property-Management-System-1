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
      // Safeguard: Check if occupied
      const unit = await unitModel.findById(req.params.id);
      if (!unit) {
        return res.status(404).json({ error: 'Unit not found' });
      }

      if (unit.status === 'occupied') {
        return res
          .status(400)
          .json({ error: 'Cannot delete an occupied unit.' });
      }

      // Deeper Safeguards: Check for Maintenance history
      const maintenanceRequestModel = (await import('../models/maintenanceRequestModel.js')).default;
      const requests = await maintenanceRequestModel.findByUnitId ? await maintenanceRequestModel.findByUnitId(req.params.id) : []; 
      // Fallback if I haven't added findByUnitId yet - I will add it or use raw
      const [mRows] = await (await import('../config/db.js')).default.query('SELECT 1 FROM maintenance_requests WHERE unit_id = ? LIMIT 1', [req.params.id]);
      if (mRows.length > 0) {
        return res.status(400).json({ error: 'Cannot delete unit with maintenance history. Void or archive history first.' });
      }

      // Check for Active or Pending Leases
      const [lRows] = await (await import('../config/db.js')).default.query("SELECT 1 FROM leases WHERE unit_id = ? AND status IN ('active', 'pending') LIMIT 1", [req.params.id]);
      if (lRows.length > 0) {
        return res.status(400).json({ error: 'Cannot delete unit with active or pending leases.' });
      }

      const success = await unitModel.delete(req.params.id);
      if (!success) return res.status(404).json({ error: 'Unit not found' });
      res.json({ message: 'Unit deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new UnitController();
