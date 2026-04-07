import unitTypeModel from '../models/unitTypeModel.js';

class UnitTypeController {
  async getAllUnitTypes(req, res) {
    try {
      const types = await unitTypeModel.findAll();
      res.json(types);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getUnitTypeById(req, res) {
    try {
      const type = await unitTypeModel.findById(req.params.id);
      if (!type) {
        return res.status(404).json({ error: 'Unit type not found' });
      }
      res.json(type);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async createUnitType(req, res) {
    try {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }
      const typeId = await unitTypeModel.create({ name, description });
      res.status(201).json({ id: typeId, name, description });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res
          .status(400)
          .json({ error: 'Unit type with this name already exists' });
      }
      res.status(500).json({ error: error.message });
    }
  }

  async updateUnitType(req, res) {
    try {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }
      const success = await unitTypeModel.update(req.params.id, {
        name,
        description,
      });
      if (!success) {
        return res.status(404).json({ error: 'Unit type not found' });
      }
      res.json({ message: 'Unit type updated successfully' });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res
          .status(400)
          .json({ error: 'Unit type with this name already exists' });
      }
      res.status(500).json({ error: error.message });
    }
  }

  async deleteUnitType(req, res) {
    try {
      const success = await unitTypeModel.delete(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Unit type not found' });
      }
      res.json({ message: 'Unit type deleted successfully' });
    } catch (error) {
      // Check if FK constraint violation
      if (error.code === 'ER_ROW_IS_REFERENCED_2') {
        return res
          .status(400)
          .json({ error: 'Cannot delete unit type that is in use by units' });
      }
      res.status(500).json({ error: error.message });
    }
  }
}

export default new UnitTypeController();
