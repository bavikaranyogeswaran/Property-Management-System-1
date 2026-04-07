import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import pool from '../config/db.js';
import { validatePropertyConfig } from '../utils/validators.js';

class PropertyService {
  async createProperty(data) {
    // data contains: name, propertyTypeId, propertyNo, street, city, district, imageUrl, description, features
    if (
      !data.name ||
      !data.street ||
      !data.city ||
      !data.district ||
      !data.propertyTypeId
    ) {
      throw new Error('Missing required fields');
    }

    const configValidation = validatePropertyConfig(data);
    if (!configValidation.isValid) {
      throw new Error(configValidation.errors.join(', '));
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
    const configValidation = validatePropertyConfig(data);
    if (!configValidation.isValid) {
      throw new Error(configValidation.errors.join(', '));
    }

    const updated = await propertyModel.update(id, data);
    if (!updated) {
      throw new Error('Property not found or update failed');
    }
    return await propertyModel.findById(id);
  }

  async deleteProperty(id) {
    // 1. Check for any active or pending leases targeting units in this property
    const activeLeaseCount = await leaseModel.countActiveByPropertyId(id);
    if (activeLeaseCount > 0) {
      throw new Error(
        'Cannot archive property with active or pending leases. Please terminate or finish leases first.'
      );
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 2. Cascading Archival: Mark all units of this property as archived
      await unitModel.archiveByPropertyId(id, connection);

      // 3. Mark property as archived
      const deleted = await propertyModel.delete(id, connection);
      if (!deleted) {
        throw new Error('Property not found or archival failed');
      }

      await connection.commit();
      return { message: 'Property and all its units archived successfully' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getPropertyTypes() {
    return await propertyModel.getTypes();
  }
  async addImages(propertyId, files) {
    if (!files || files.length === 0) return [];

    // Construct image URLs
    const imagesData = files.map((file, index) => ({
      propertyId: propertyId,
      imageUrl: file.path || file.secure_url,
      isPrimary: index === 0 ? 1 : 0,
      displayOrder: index,
    }));

    // If any new image is primary, we MUST unset existing primary images for this property
    const hasNewPrimary = imagesData.some((img) => img.isPrimary === 1);
    if (hasNewPrimary) {
      await propertyModel.clearPrimaryImages(propertyId);
    }

    const addedImages = await propertyModel.addImages(propertyId, imagesData);

    // Update main property table with primary image if exists
    const primaryImage =
      imagesData.find((img) => img.isPrimary === 1) || imagesData[0];
    if (primaryImage) {
      await propertyModel.update(propertyId, {
        imageUrl: primaryImage.imageUrl,
      });
    }

    return addedImages;
  }
}

export default new PropertyService();
