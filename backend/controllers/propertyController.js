import propertyService from '../services/propertyService.js';

class PropertyController {
    async createProperty(req, res) {
        try {
            // Owner ID from authenticated user (assuming owner role verification in middleware)
            const ownerId = req.user.id;
            const property = await propertyService.createProperty({ ...req.body, ownerId });
            res.status(201).json(property);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getProperties(req, res) {
        try {
            const properties = await propertyService.getProperties(req.user.id);
            res.json(properties);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getPropertyById(req, res) {
        try {
            const property = await propertyService.getPropertyById(req.params.id);
            if (!property) return res.status(404).json({ error: 'Property not found' });
            res.json(property);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async updateProperty(req, res) {
        try {
            const property = await propertyService.updateProperty(req.params.id, req.body);
            res.json(property);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async deleteProperty(req, res) {
        try {
            const result = await propertyService.deleteProperty(req.params.id);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getPropertyTypes(req, res) {
        try {
            const types = await propertyService.getPropertyTypes();
            res.json(types);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

export default new PropertyController();
