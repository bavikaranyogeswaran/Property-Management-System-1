import propertyTypeModel from '../models/propertyTypeModel.js';

// ============================================================================
//  PROPERTY TYPE CONTROLLER (The Building Category Manager)
// ============================================================================
//  This file manages the different tags for properties (e.g., "Apartment",
//  "Commercial Office", "Villa").
// ============================================================================

class PropertyTypeController {
  // GET ALL TYPES: Lists every property category available.
  async getAllPropertyTypes(req, res) {
    try {
      // 1. [DATA] Collection Retrieval
      const types = await propertyTypeModel.findAll();
      res.json(types);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // GET BY ID: Retrieves a specific category definition.
  async getPropertyTypeById(req, res) {
    try {
      // 1. [DATA] Resolution
      const type = await propertyTypeModel.findById(req.params.id);
      if (!type)
        return res.status(404).json({ error: 'Property type not found' });
      res.json(type);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // CREATE TYPE: Adds a new property category format to the system.
  async createPropertyType(req, res) {
    try {
      // 1. [DATA] Persistence
      const id = await propertyTypeModel.create(req.body);
      const newType = await propertyTypeModel.findById(id);
      res.status(201).json(newType);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // UPDATE TYPE: Modifies an existing property category.
  async updatePropertyType(req, res) {
    try {
      // 1. [DATA] Vault Update
      const success = await propertyTypeModel.update(req.params.id, req.body);
      if (!success)
        return res.status(404).json({ error: 'Property type not found' });

      // 2. [DATA] Re-fetching fresh state
      const updatedType = await propertyTypeModel.findById(req.params.id);
      res.json(updatedType);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // DELETE TYPE: Removes a property category.
  async deletePropertyType(req, res) {
    try {
      // 1. [DATA] Purge Logic
      const success = await propertyTypeModel.delete(req.params.id);
      if (!success)
        return res.status(404).json({ error: 'Property type not found' });
      res.json({ message: 'Property type deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new PropertyTypeController();
