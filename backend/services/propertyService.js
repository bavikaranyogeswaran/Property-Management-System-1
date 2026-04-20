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
  // CREATE PROPERTY: Registers a new building asset. Validates geographic and operational configuration.
  async createProperty(data) {
    // 1. [VALIDATION] Check for mandatory geographic and identity fields
    if (
      !data.name ||
      !data.street ||
      !data.city ||
      !data.district ||
      !data.propertyTypeId
    )
      throw new Error('Missing required fields');

    // 2. [VALIDATION] Deep config check (e.g., late fee thresholds, grace periods)
    const validation = validatePropertyConfig(data);
    if (!validation.isValid) throw new Error(validation.errors.join(', '));

    // 3. Persist and return hydrated record
    const id = await propertyModel.create(data);
    return await propertyModel.findById(id);
  }

  // GET PROPERTIES: Advanced listing logic that shows specific buildings based on whether you're a Guest, Staff, or Owner.
  async getProperties(user, query = {}) {
    // 1. [SECURITY] Public Browse: Return all non-archived properties (Guest access)
    if (user === null || query.public === 'true')
      return await propertyModel.findAll(null);

    // 2. [SECURITY] Role-based scope filtering
    if (user.role === ROLES.TREASURER) {
      const staffModel = (await import('../models/staffModel.js')).default;
      return await staffModel.getAssignedProperties(user.id);
    }

    if (user.role === ROLES.OWNER) return await propertyModel.findAll(user.id);

    // 3. Default: Fallback to global list (Archived properties remain hidden at model level)
    return await propertyModel.findAll(null);
  }

  // VERIFY OWNERSHIP: A security check to ensure an Owner actually own the building they're trying to edit.
  // VERIFY OWNERSHIP: High-level security gatekeeper for property mutations.
  async verifyOwnership(propertyId, userId, role) {
    // 1. Identify existence
    const property = await propertyModel.findById(propertyId);
    if (!property) {
      const err = new Error('Property not found');
      err.statusCode = 404;
      throw err;
    }

    // 2. [SECURITY] Authorization Check: verify ownership if role is Owner (System bypasses)
    if (role === ROLES.OWNER && String(property.ownerId) !== String(userId)) {
      const err = new Error('You do not own this property');
      err.statusCode = 403;
      throw err;
    }

    return property;
  }

  // GET BY ID: Simple resolver for property identity.
  async getPropertyById(id) {
    return await propertyModel.findById(id);
  }

  // UPDATE PROPERTY: Modifies building configuration. Validates logic changes (e.g., changing late fee rules).
  async updateProperty(id, data) {
    // 1. [VALIDATION] Re-validate operational config
    const validation = validatePropertyConfig(data);
    if (!validation.isValid) throw new Error(validation.errors.join(', '));

    // 2. Perform update
    const updated = await propertyModel.update(id, data);
    if (!updated) throw new Error('Update failed');
    return await propertyModel.findById(id);
  }

  // DELETE PROPERTY: Safely archives a building and its units, but only if all leases are finished.
  // DELETE PROPERTY: Lifecycle termination engine. Implements cascading archival of child resources (Units).
  async deleteProperty(id) {
    // 1. [SECURITY] Structural Constraint: Prevent deletion if any active legal contracts (Leases) exist
    if ((await leaseModel.countActiveByPropertyId(id)) > 0)
      throw new Error('Cannot delete property with active leases.');

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 2. [SIDE EFFECT] Cascade archive Units: ensures consistency in the listing engine
      await unitModel.archiveByPropertyId(id, connection);

      // 3. Mark property as archived (soft-delete)
      if (!(await propertyModel.delete(id, connection)))
        throw new Error('Archival failed');

      await connection.commit();
      return { message: 'Property and Units archived.' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // GET TYPES: Fetch meta-categories (e.g., Apartment, House, Shop).
  async getPropertyTypes() {
    return await propertyModel.getTypes();
  }
  // ADD IMAGES: Attaches photos to a property to make it look good on the public list.
  // ADD IMAGES: Asset management for property listings. Manages primary image designations.
  async addImages(propertyId, files) {
    if (!files || files.length === 0) return [];

    // 1. [SECURITY] Map uploaded file URLs to record schema
    const imagesData = files.map((file, i) => ({
      propertyId,
      imageUrl: file.url,
      isPrimary: i === 0 ? 1 : 0,
      displayOrder: i,
    }));

    // 2. [SIDE EFFECT] Primary Guard: If new images are primary, clear existing ones to maintain single-hero-image constraint
    if (imagesData.some((img) => img.isPrimary === 1))
      await propertyModel.clearPrimaryImages(propertyId);

    const added = await propertyModel.addImages(propertyId, imagesData);

    // 3. [LEGACY SYNC] Update main property table hero-image for backward compatibility
    try {
      const hero =
        imagesData.find((img) => img.isPrimary === 1) || imagesData[0];
      if (hero)
        await propertyModel.update(propertyId, { imageUrl: hero.imageUrl });
    } catch (e) {
      console.warn('Legacy sync failed:', e.message);
    }

    return added;
  }

  // GET LEASE TERMS: Resolves legal templates applicable to the property owner.
  async getLeaseTermsByPropertyId(propertyId) {
    const property = await propertyModel.findById(propertyId);
    if (!property) {
      const err = new Error('Property not found');
      err.statusCode = 404;
      throw err;
    }
    return await leaseTermModel.findAllByOwner(property.ownerId);
  }
}

export default new PropertyService();
