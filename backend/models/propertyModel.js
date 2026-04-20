// ============================================================================
//  PROPERTY MODEL (The Building Blueprints)
// ============================================================================
//  This file manages the records of all physical buildings (Properties).
//  It saves details like address, owner, and description.
// ============================================================================

import db from '../config/db.js';
import cacheService from '../services/cacheService.js';

class PropertyModel {
  // CREATE PROPERTY: Filing a deed for a new building with financial policy defaults.
  async create(propertyData) {
    const {
      ownerId,
      name,
      propertyTypeId,
      propertyNo,
      street,
      city,
      district,
      imageUrl,
      description,
      features,
      managementFeePercentage,
    } = propertyData;

    let result;
    try {
      // 1. [DATA] Persistence: Insert core building metadata with late fee and management configurations
      [result] = await db.query(
        `INSERT INTO properties 
                (owner_id, name, property_type_id, property_no, street, city, district, image_url, description, late_fee_percentage, late_fee_type, late_fee_amount, late_fee_grace_period, tenant_deactivation_days, management_fee_percentage) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ownerId,
          name,
          propertyTypeId,
          propertyNo,
          street,
          city,
          district,
          imageUrl,
          description,
          propertyData.lateFeePercentage !== undefined
            ? propertyData.lateFeePercentage
            : 3.0,
          propertyData.lateFeeType || 'flat_percentage',
          propertyData.lateFeeAmount || 0,
          propertyData.lateFeeGracePeriod !== undefined
            ? propertyData.lateFeeGracePeriod
            : 5,
          propertyData.tenantDeactivationDays || 30,
          managementFeePercentage || 0.0,
        ]
      );
    } catch (err) {
      // 2. [SECURITY] Duplicate Guard: Catch portfolio-level naming collisions
      if (
        err.code === 'ER_DUP_ENTRY' &&
        err.message.includes('unique_property_no')
      ) {
        const error = new Error(
          'A property with this Property Number already exists in your portfolio.'
        );
        error.status = 400;
        throw error;
      }
      throw err;
    }

    const propertyId = result.insertId;

    // 3. [1NF] Normalization: Sync associated amenities into the dedicated relational table
    if (Array.isArray(features) && features.length > 0) {
      await this._syncAmenities(propertyId, features);
    }

    return propertyId;
  }

  // FIND ALL: Registry of all buildings, optionally filtered by owner.
  async findAll(ownerId = null) {
    // 1. [QUERY] Extraction: Joins types and performs a subquery for the primary image cover
    let query = `
            SELECT 
                p.property_id, p.owner_id, p.name, p.property_no, p.street, p.city, p.district,
                COALESCE(
                  (SELECT pi.image_url FROM property_images pi WHERE pi.property_id = p.property_id AND pi.is_primary = TRUE LIMIT 1),
                  p.image_url
                ) AS image_url,
                p.description, p.status, p.created_at, p.property_type_id,
                p.late_fee_percentage, p.late_fee_type, p.late_fee_amount, p.late_fee_grace_period,
                p.tenant_deactivation_days, p.management_fee_percentage,
                pt.name as type_name, pt.type_id as type_id
            FROM properties p
            LEFT JOIN property_types pt ON p.property_type_id = pt.type_id
            WHERE p.is_archived = FALSE
        `;

    const params = [];
    if (ownerId) {
      query += ' AND p.owner_id = ?';
      params.push(ownerId);
    }

    const [rows] = await db.query(query, params);

    // 2. [QUERY] Batch Load: Fetches amenities for all resolved properties in a single round-trip
    const propertyIds = rows.map((r) => r.property_id);
    const amenitiesMap = await this._getAmenitiesBatch(propertyIds);

    return rows.map((row) => ({
      id: row.property_id.toString(),
      ownerId: row.owner_id.toString(),
      name: row.name,
      propertyNo: row.property_no,
      street: row.street,
      city: row.city,
      district: row.district,
      propertyTypeId: row.property_type_id,
      typeName: row.type_name,
      imageUrl: row.image_url,
      description: row.description,
      features: amenitiesMap[row.property_id] || [],
      status: row.status,
      createdAt: row.created_at,
      lateFeePercentage: parseFloat(row.late_fee_percentage),
      lateFeeType: row.late_fee_type,
      lateFeeAmount: Number(row.late_fee_amount),
      lateFeeGracePeriod: parseInt(row.late_fee_grace_period),
      tenantDeactivationDays: parseInt(row.tenant_deactivation_days),
      managementFeePercentage: parseFloat(row.management_fee_percentage),
    }));
  }

  // FIND BY ID: Fetches a single property profile with heavy caching to reduce DB load on public listings.
  async findById(id) {
    // 1. [CACHE] Layer: Checks the 15-minute TTL vault before querying SQL
    return await cacheService.getOrSet(
      cacheService.getPropertyKey(id),
      async () => {
        // 2. [QUERY] Extraction with Cover-Image resolution
        const [rows] = await db.query(
          `SELECT p.property_id, p.owner_id, p.name, p.property_no, p.street, p.city, p.district,
                    COALESCE(
                      (SELECT pi.image_url FROM property_images pi WHERE pi.property_id = p.property_id AND pi.is_primary = TRUE LIMIT 1),
                      p.image_url
                    ) AS image_url,
                    p.description, p.status, p.created_at, p.property_type_id,
                    p.late_fee_percentage, p.late_fee_type, p.late_fee_amount, p.late_fee_grace_period,
                    p.tenant_deactivation_days, p.management_fee_percentage,
                    pt.name as type_name, pt.type_id as type_id
                FROM properties p
                JOIN property_types pt ON p.property_type_id = pt.type_id
                WHERE p.property_id = ? AND p.is_archived = FALSE`,
          [id]
        );

        if (!rows[0]) return null;

        // 3. [QUERY] Entity Resolution: Fetch the normalized amenity set
        const amenities = await this._getAmenities(id);

        return {
          id: rows[0].property_id.toString(),
          ownerId: rows[0].owner_id.toString(),
          name: rows[0].name,
          propertyNo: rows[0].property_no,
          street: rows[0].street,
          city: rows[0].city,
          district: rows[0].district,
          propertyTypeId: rows[0].property_type_id,
          typeName: rows[0].type_name,
          imageUrl: rows[0].image_url,
          description: rows[0].description,
          features: amenities,
          status: rows[0].status,
          createdAt: rows[0].created_at,
          lateFeePercentage: parseFloat(rows[0].late_fee_percentage),
          lateFeeType: rows[0].late_fee_type,
          lateFeeAmount: Number(rows[0].late_fee_amount),
          lateFeeGracePeriod: parseInt(rows[0].late_fee_grace_period),
          tenantDeactivationDays: parseInt(rows[0].tenant_deactivation_days),
          managementFeePercentage: parseFloat(
            rows[0].management_fee_percentage
          ),
        };
      },
      900
    );
  }

  static UPDATE_KEY_MAP = {
    name: 'name',
    propertyTypeId: 'property_type_id',
    propertyNo: 'property_no',
    street: 'street',
    city: 'city',
    district: 'district',
    imageUrl: 'image_url',
    status: 'status',
    description: 'description',
    lateFeePercentage: 'late_fee_percentage',
    lateFeeType: 'late_fee_type',
    lateFeeAmount: 'late_fee_amount',
    lateFeeGracePeriod: 'late_fee_grace_period',
    tenantDeactivationDays: 'tenant_deactivation_days',
    managementFeePercentage: 'management_fee_percentage',
  };

  // UPDATE: Modifies building metadata and refreshes relational amenities.
  async update(id, updates) {
    const fields = [];
    const values = [];
    const featuresToSync = updates.features;

    // 1. [TRANSFORMATION] Dynamic Query Builder
    Object.keys(updates).forEach((key) => {
      const column = PropertyModel.UPDATE_KEY_MAP[key];
      if (column && updates[key] !== undefined && key !== 'features') {
        fields.push(`${column} = ?`);
        values.push(updates[key]);
      }
    });

    if (fields.length === 0 && !featuresToSync) return false;

    // 2. [CACHE] Invalidation: Purge stale property data from the cache layer
    await cacheService.invalidate(cacheService.getPropertyKey(id));

    if (fields.length > 0) {
      values.push(id);
      try {
        const [result] = await db.query(
          `UPDATE properties SET ${fields.join(', ')} WHERE property_id = ? AND is_archived = FALSE`,
          values
        );
        if (result.affectedRows === 0) return false;
      } catch (err) {
        if (
          err.code === 'ER_DUP_ENTRY' &&
          err.message.includes('unique_property_no')
        ) {
          const error = new Error(
            'A property with this Property Number already exists in your portfolio.'
          );
          error.status = 400;
          throw error;
        }
        throw err;
      }
    }

    // 3. [1NF] Normalization Sync: Update features table if modified
    if (Array.isArray(featuresToSync)) {
      await this._syncAmenities(id, featuresToSync);
    }

    return true;
  }

  // DELETE: Soft-archives a property and triggers asset cleanup in the background.
  async delete(id, connection = null) {
    const dbConn = connection || db;

    // 1. [QUERY] Pre-Archival Snapshot: Capture all image URLs for storage cleanup
    const [images] = await dbConn.query(
      'SELECT image_url FROM property_images WHERE property_id = ?',
      [id]
    );

    // 2. [CACHE] Cleanse
    await cacheService.invalidate(cacheService.getPropertyKey(id));

    // 3. [DATA] Archival: Flag as archived to hide from active listings while preserving audit history
    const [result] = await dbConn.query(
      "UPDATE properties SET archived_at = NOW(), is_archived = TRUE, status = 'inactive' WHERE property_id = ?",
      [id]
    );
    const success = result.affectedRows > 0;

    // 4. [SIDE-EFFECT] Background Task: Queue Cloudinary deletions for all archived images
    if (success && images.length > 0) {
      const { mainQueue } = await import('../config/queue.js');
      const { extractPublicId } = await import('../utils/cronJobs.js');

      for (const img of images) {
        const publicId = extractPublicId(img.image_url);
        if (publicId) {
          mainQueue.add(
            'cleanup_cloudinary_asset_task',
            { publicId },
            { attempts: 3, backoff: 30000 }
          );
        }
      }
    }

    return success;
  }

  // GET TYPES: Registry of property categories (e.g., Residential, Commercial).
  async getTypes() {
    // 1. [CACHE] Layer: Long-term cache for static type data
    return await cacheService.getOrSet(
      'cache:property_types',
      async () => {
        const [rows] = await db.query('SELECT * FROM property_types');
        return rows.map((row) => ({
          id: row.type_id.toString(),
          name: row.name,
          description: row.description,
        }));
      },
      86400
    );
  }

  // ADD IMAGES: Attaches new photos to the property gallery in bulk.
  async addImages(propertyId, imagesData) {
    if (!imagesData || imagesData.length === 0) return [];
    // 1. [DATA] Batch Transformation
    const values = imagesData.map((img) => [
      img.propertyId,
      img.imageUrl,
      img.isPrimary,
      img.displayOrder,
    ]);

    // 2. [DATA] Multi-Persistence
    await db.query(
      'INSERT INTO property_images (property_id, image_url, is_primary, display_order) VALUES ?',
      [values]
    );

    // 3. [QUERY] Refreshed List Retrieval
    const [rows] = await db.query(
      'SELECT * FROM property_images WHERE property_id = ? ORDER BY display_order ASC',
      [propertyId]
    );
    return rows.map((row) => ({
      id: row.image_id.toString(),
      propertyId: row.property_id.toString(),
      imageUrl: row.image_url,
      isPrimary: !!row.is_primary,
      displayOrder: row.display_order,
      uploadedAt: row.created_at,
    }));
  }

  // FIND OWNER DETAILS: Resolves contact information for the building's investor.
  async findOwnerDetails(propertyId) {
    // 1. [QUERY] Filtered Join
    const [rows] = await db.query(
      `SELECT p.name as property_name, u.email as owner_email, u.user_id as owner_id 
             FROM properties p
             JOIN users u ON p.owner_id = u.user_id
             WHERE p.property_id = ?`,
      [propertyId]
    );
    if (!rows[0]) return null;
    return {
      propertyName: rows[0].property_name,
      ownerEmail: rows[0].owner_email,
      ownerId: rows[0].owner_id.toString(),
    };
  }

  // CLEAR PRIMARY IMAGES: Resets primary status across the gallery before setting a new cover.
  async clearPrimaryImages(propertyId) {
    // 1. [DATA] State Reset
    await db.query(
      'UPDATE property_images SET is_primary = 0 WHERE property_id = ?',
      [propertyId]
    );
    return true;
  }

  // IS STAFF ASSIGNED TO OWNER: RBAC check to see if a treasurer has access to an investor's properties.
  async isStaffAssignedToOwner(staffId, ownerId) {
    // 1. [SECURITY] Join-Based Validation: Efficient cross-lookup through assignments
    const [rows] = await db.query(
      `SELECT 1 FROM staff_property_assignments spa
            JOIN properties p ON spa.property_id = p.property_id
            WHERE spa.user_id = ? AND p.owner_id = ? AND p.is_archived = FALSE
            LIMIT 1`,
      [staffId, ownerId]
    );
    return rows.length > 0;
  }

  // ============================================================================
  //  AMENITY HELPERS (1NF Normalization)
  // ============================================================================

  // SYNC AMENITIES: Reconciles the property_amenities table against a list of features.
  async _syncAmenities(propertyId, features) {
    // 1. [DATA] Cleanup: Purge existing amenities to allow fresh sync
    await db.query('DELETE FROM property_amenities WHERE property_id = ?', [
      propertyId,
    ]);
    if (!features || features.length === 0) return;

    // 2. [SANITY] Filter & De-dupe: Ensure safe string storage
    const uniqueFeatures = [
      ...new Set(features.filter((f) => f && typeof f === 'string')),
    ];
    if (uniqueFeatures.length === 0) return;

    // 3. [DATA] Batch Persistence
    const values = uniqueFeatures.map((name) => [propertyId, name]);
    await db.query(
      'INSERT IGNORE INTO property_amenities (property_id, name) VALUES ?',
      [values]
    );
  }

  // GET AMENITIES: Resolve features for a specific property.
  async _getAmenities(propertyId) {
    // 1. [QUERY] Retrieval
    const [rows] = await db.query(
      'SELECT name FROM property_amenities WHERE property_id = ? ORDER BY name ASC',
      [propertyId]
    );
    return rows.map((r) => r.name);
  }

  // GET AMENITIES BATCH: High-performance bucketed retrieval for multiple buildings.
  async _getAmenitiesBatch(propertyIds) {
    if (!propertyIds || propertyIds.length === 0) return {};
    // 1. [QUERY] Set-Based Retrieval
    const [rows] = await db.query(
      'SELECT property_id, name FROM property_amenities WHERE property_id IN (?) ORDER BY name ASC',
      [propertyIds]
    );

    // 2. [TRANSFORMATION] Bucket mapping: Grouping rows by Property ID
    const map = {};
    for (const row of rows) {
      if (!map[row.property_id]) map[row.property_id] = [];
      map[row.property_id].push(row.name);
    }
    return map;
  }
}

export default new PropertyModel();
