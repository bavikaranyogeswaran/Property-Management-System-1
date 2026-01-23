import propertyTypeModel from '../models/propertyTypeModel.js';

class PropertyTypeController {
    async getAllPropertyTypes(req, res) {
        try {
            const types = await propertyTypeModel.findAll();
            res.json(types);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getPropertyTypeById(req, res) {
        try {
            const type = await propertyTypeModel.findById(req.params.id);
            if (!type) return res.status(404).json({ error: 'Property type not found' });
            res.json(type);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async createPropertyType(req, res) {
        try {
            const id = await propertyTypeModel.create(req.body);
            const newType = await propertyTypeModel.findById(id);
            res.status(201).json(newType);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async updatePropertyType(req, res) {
        try {
            const success = await propertyTypeModel.update(req.params.id, req.body);
            if (!success) return res.status(404).json({ error: 'Property type not found' });
            const updatedType = await propertyTypeModel.findById(req.params.id);
            res.json(updatedType);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async deletePropertyType(req, res) {
        try {
            const success = await propertyTypeModel.delete(req.params.id);
            if (!success) return res.status(404).json({ error: 'Property type not found' });
            res.json({ message: 'Property type deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

export default new PropertyTypeController();
