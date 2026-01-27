import propertyModel from '../models/propertyModel.js';

class PropertyService {
    async createProperty(data) {
        // data contains: name, propertyTypeId, propertyNo, street, city, district, imageUrl, ownerId
        if (!data.name || !data.street || !data.city || !data.district || !data.propertyTypeId) {
            throw new Error('Missing required fields');
        }

        const id = await propertyModel.create(data);
        return await propertyModel.findById(id);
    }

    async getProperties() {
        return await propertyModel.findAll();
    }

    async getPropertyById(id) {
        return await propertyModel.findById(id);
    }

    async updateProperty(id, data) {
        const updated = await propertyModel.update(id, data);
        if (!updated) {
            throw new Error('Property not found or update failed');
        }
        return await propertyModel.findById(id);
    }

    async deleteProperty(id) {
        const deleted = await propertyModel.delete(id);
        if (!deleted) {
            throw new Error('Property not found or delete failed');
        }
        return { message: 'Property deleted successfully' };
    }

    async getPropertyTypes() {
        return await propertyModel.getTypes();
    }
}

export default new PropertyService();
