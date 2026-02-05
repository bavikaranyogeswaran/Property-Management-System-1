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
            // Check if user is authenticated (req.user exists)
            // If authenticated, we *could* filter by owner, but the current requirement seems to be
            // "Show all properties" on the main page, or maybe "Show Owner's properties" in dashboard.
            // The route is currently PUBLIC in `propertyRoutes.js`.
            // Let's pass `null` or handle it based on role if needed.
            // For now, to match the previous logic but safely:

            const userId = req.user ? req.user.id : null;

            // If the intention of this specific controller method is "Get All Properties contextually",
            // we should probably just fetch all active ones for public view,
            // OR fetch specific ones if filtering is requested.
            // The previous code was `propertyService.getProperties(req.user.id)`.
            // If we want to support public view, we pass null.

            const properties = await propertyService.getProperties(userId);
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
            await propertyService.deleteProperty(req.params.id);
            res.json({ message: 'Property deleted successfully' });
        } catch (error) {
            console.error('Error deleting property:', error);
            res.status(500).json({ error: 'Failed to delete property' });
        }
    }

    async uploadImages(req, res) {
        try {
            const propertyId = req.params.id;
            const files = req.files;

            if (!files || files.length === 0) {
                return res.status(400).json({ error: 'No images uploaded' });
            }

            const images = await propertyService.addImages(propertyId, files);
            res.status(201).json({ message: 'Images uploaded successfully', images });
        } catch (error) {
            console.error('Error uploading images:', error);
            res.status(500).json({ error: 'Failed to upload images' });
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
