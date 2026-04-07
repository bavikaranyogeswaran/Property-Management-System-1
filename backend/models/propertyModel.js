// ============================================================================
//  PROPERTY MODEL (The Building Blueprints)
// ============================================================================
//  This file manages the records of all physical buildings (Properties).
//  It saves details like address, owner, and description.
// ============================================================================

import db from '../config/db.js';

class PropertyModel {
  //  CREATE PROPERTY: Filing a deed for a new building.
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

    // Ensure features is a JSON string if it's an array/object, or null if empty
    const featuresJson = features ? JSON.stringify(features) : null;

    const [result] = await db.query(
      `INSERT INTO properties 
              (owner_id, name, property_type_id, property_no, street, city, district, image_url, description, features, late_fee_percentage, late_fee_type, late_fee_amount, late_fee_grace_period, tenant_deactivation_days, management_fee_percentage) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        featuresJson,
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
    return result.insertId;
  }

  async findAll(ownerId = null) {
    let query = `
            SELECT 
                p.property_id, 
                p.owner_id, 
                p.name, 
                p.property_no,
                p.street,
                p.city,
                p.district,
                p.image_url, 
                p.description,
                p.features,
                p.status, 
                p.created_at,
                p.property_type_id,
                p.late_fee_percentage,
                p.late_fee_type,
                p.late_fee_amount,
                p.late_fee_grace_period,
                p.tenant_deactivation_days,
                p.management_fee_percentage,
                pt.name as type_name,
                pt.type_id as type_id
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
      features: row.features || [],
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

  async findById(id) {
    const [rows] = await db.query(
      `
            SELECT 
                p.property_id, 
                p.owner_id, 
                p.name, 
                p.property_no,
                p.street,
                p.city,
                p.district,
                p.image_url, 
                p.description,
                p.features,
                p.status, 
                p.created_at,
                p.property_type_id,
                p.late_fee_percentage,
                p.late_fee_type,
                p.late_fee_amount,
                p.late_fee_grace_period,
                p.tenant_deactivation_days,
                p.management_fee_percentage,
                pt.name as type_name,
                pt.type_id as type_id
            FROM properties p
            JOIN property_types pt ON p.property_type_id = pt.type_id
            WHERE p.property_id = ? AND p.is_archived = FALSE
        `,
      [id]
    );

    if (!rows[0]) return null;

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
      features: rows[0].features || [],
      status: rows[0].status,
      createdAt: rows[0].created_at,
      lateFeePercentage: parseFloat(rows[0].late_fee_percentage),
      lateFeeType: rows[0].late_fee_type,
      lateFeeAmount: Number(rows[0].late_fee_amount),
      lateFeeGracePeriod: parseInt(rows[0].late_fee_grace_period),
      tenantDeactivationDays: parseInt(rows[0].tenant_deactivation_days),
      managementFeePercentage: parseFloat(rows[0].management_fee_percentage),
    };
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
    features: 'features',
    lateFeePercentage: 'late_fee_percentage',
    lateFeeType: 'late_fee_type',
    lateFeeAmount: 'late_fee_amount',
    lateFeeGracePeriod: 'late_fee_grace_period',
    tenantDeactivationDays: 'tenant_deactivation_days',
    managementFeePercentage: 'management_fee_percentage',
  };

  async update(id, updates) {
    const fields = [];
    const values = [];

    Object.keys(updates).forEach((key) => {
      const column = PropertyModel.UPDATE_KEY_MAP[key];
      if (column && updates[key] !== undefined) {
        fields.push(`${column} = ?`);
        const val =
          key === 'features' ? JSON.stringify(updates[key]) : updates[key];
        values.push(val);
      }
    });

    if (fields.length === 0) return false;

    values.push(id);
    const [result] = await db.query(
      `UPDATE properties SET ${fields.join(', ')} WHERE property_id = ? AND is_archived = FALSE`,
      values
    );
    return result.affectedRows > 0;
  }

  async delete(id, connection = null) {
    const dbConn = connection || db;

    // 1. Fetch all associated image URLs before archival/deletion
    const [images] = await dbConn.query(
      'SELECT image_url FROM property_images WHERE property_id = ?',
      [id]
    );

    // 2. Perform the soft-delete
    const [result] = await dbConn.query(
      "UPDATE properties SET archived_at = NOW(), is_archived = TRUE, status = 'inactive' WHERE property_id = ?",
      [id]
    );

    const success = result.affectedRows > 0;

    // 3. Enqueue Cloudinary cleanup if archival was successful
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

  async getTypes() {
    const [rows] = await db.query('SELECT * FROM property_types');
    return rows.map((row) => ({
      id: row.type_id.toString(),
      name: row.name,
      description: row.description,
    }));
  }

  async addImages(propertyId, imagesData) {
    if (!imagesData || imagesData.length === 0) return [];

    const values = imagesData.map((img) => [
      img.propertyId,
      img.imageUrl,
      img.isPrimary,
      img.displayOrder,
    ]);

    // Bulk insert
    await db.query(
      'INSERT INTO property_images (property_id, image_url, is_primary, display_order) VALUES ?',
      [values]
    );

    // Fetch and return created images
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
  async findOwnerDetails(propertyId) {
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

  async clearPrimaryImages(propertyId) {
    await db.query(
      'UPDATE property_images SET is_primary = 0 WHERE property_id = ?',
      [propertyId]
    );
    return true;
  }

  /**
   * [HIGH-PERFORMANCE] Checks if a staff member is assigned to ANY property owned by a specific owner.
   * Replaces dual-model fetching and in-memory comparisons with a single JOIN check.
   */
  async isStaffAssignedToOwner(staffId, ownerId) {
    const [rows] = await db.query(
      `
            SELECT 1 FROM staff_property_assignments spa
            JOIN properties p ON spa.property_id = p.property_id
            WHERE spa.user_id = ? AND p.owner_id = ? AND p.is_archived = FALSE
            LIMIT 1
        `,
      [staffId, ownerId]
    );
    return rows.length > 0;
  }
}

export default new PropertyModel();
