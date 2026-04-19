// ============================================================================
//  PROPERTY SERVICE (The Real Estate Expert)
// ============================================================================
//  This service handles the business logic for properties (buildings).
//  It manages ownership verification, property listing for different roles,
//  and the "archival" (deletion) process.
// ============================================================================

import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import pool from '../config/db.js';
import { validatePropertyConfig } from '../utils/validators.js';
import leaseTermModel from '../models/leaseTermModel.js';
import { ROLES } from '../utils/roleUtils.js';

class PropertyService {
  // CREATE PROPERTY: Registers a new building with its address and type.
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

  // GET PROPERTIES: Advanced listing logic that shows specific buildings based on whether you're a Guest, Staff, or Owner.
  async getProperties(user, query = {}) {
    const isPublic = query.public === 'true';

    // 1. Logic for Public Browse
    if (isPublic) {
      return await propertyModel.findAll(null);
    }

    // 2. Logic for Logged-in Users
    if (!user) {
      throw new Error('Authentication required for private property view');
    }

    if (user.role === ROLES.TREASURER) {
      // Treasurer sees only assigned properties
      const staffModel = (await import('../models/staffModel.js')).default;
      return await staffModel.getAssignedProperties(user.id);
    }

    if (user.role === ROLES.OWNER) {
      // Owner sees only their own assets
      return await propertyModel.findAll(user.id);
    }

    // Default: Anyone else (e.g., Tenants) sees all active properties to find their building
    return await propertyModel.findAll(null);
  }

  // VERIFY OWNERSHIP: A security check to ensure an Owner actually own the building they're trying to edit.
  async verifyOwnership(propertyId, userId, role) {
    const property = await propertyModel.findById(propertyId);
    if (!property) {
      const error = new Error('Property not found');
      error.statusCode = 404;
      throw error;
    }

    if (role === ROLES.OWNER && String(property.ownerId) !== String(userId)) {
      const error = new Error('You do not own this property');
      error.statusCode = 403;
      throw error;
    }

    return property;
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

  // DELETE PROPERTY: Safely archives a building and its units, but only if all leases are finished.
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
  // ADD IMAGES: Attaches photos to a property to make it look good on the public list.
  async addImages(propertyId, files) {
    if (!files || files.length === 0) return [];

    // Construct image URLs
    const imagesData = files.map((file, index) => ({
      propertyId: propertyId,
      imageUrl: file.url,
      isPrimary: index === 0 ? 1 : 0,
      displayOrder: index,
    }));

    // If any new image is primary, we MUST unset existing primary images for this property
    const hasNewPrimary = imagesData.some((img) => img.isPrimary === 1);
    if (hasNewPrimary) {
      await propertyModel.clearPrimaryImages(propertyId);
    }

    const addedImages = await propertyModel.addImages(propertyId, imagesData);

    // [LEGACY SYNC] Keep properties.image_url in sync for backward compat
    try {
      const primaryImage =
        imagesData.find((img) => img.isPrimary === 1) || imagesData[0];
      if (primaryImage) {
        await propertyModel.update(propertyId, {
          imageUrl: primaryImage.imageUrl,
        });
      }
    } catch (syncErr) {
      console.warn(
        `Legacy property image sync failed for property ${propertyId}:`,
        syncErr.message
      );
    }

    return addedImages;
  }

  async getLeaseTermsByPropertyId(propertyId) {
    const property = await propertyModel.findById(propertyId);
    if (!property) {
      const error = new Error('Property not found');
      error.statusCode = 404;
      throw error;
    }
    return await leaseTermModel.findAllByOwner(property.ownerId);
  }
}

export default new PropertyService();
