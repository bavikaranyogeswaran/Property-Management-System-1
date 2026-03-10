import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';

class PropertyService {
  async createProperty(data) {
    // data contains: name, propertyTypeId, propertyNo, street, city, district, imageUrl, ownerId
    if (
      !data.name ||
      !data.street ||
      !data.city ||
      !data.district ||
      !data.propertyTypeId
    ) {
      throw new Error('Missing required fields');
    }

    const id = await propertyModel.create(data);
    return await propertyModel.findById(id);
  }

  async getProperties(ownerId = null) {
    return await propertyModel.findAll(ownerId);
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
    // Validation: Check for existing units
    const units = await unitModel.findByPropertyId(id);
    if (units.length > 0) {
      throw new Error(
        'Cannot delete property with existing units. Please remove units first.'
      );
    }

    const deleted = await propertyModel.delete(id);
    if (!deleted) {
      throw new Error('Property not found or delete failed');
    }
    return { message: 'Property deleted successfully' };
  }

  async getPropertyTypes() {
    return await propertyModel.getTypes();
  }
  async addImages(propertyId, files) {
    if (!files || files.length === 0) return [];

    // Construct image URLs
    const imagesData = files.map((file, index) => ({
      property_id: propertyId,
      image_url: `/uploads/${file.filename}`, // Assuming you serve "uploads" folder statically
      is_primary: index === 0 ? 1 : 0, // First image is primary by default? Or handled by frontend?
      display_order: index,
    }));

    const addedImages = await propertyModel.addImages(propertyId, imagesData);

    // Update main property table with primary image if exists
    const primaryImage =
      imagesData.find((img) => img.is_primary === 1) || imagesData[0];
    if (primaryImage) {
      await propertyModel.update(propertyId, {
        imageUrl: primaryImage.image_url,
      });
    }

    return addedImages;
  }
}

export default new PropertyService();
