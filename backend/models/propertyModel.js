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
    } = propertyData;

    // Ensure features is a JSON string if it's an array/object, or null if empty
    const featuresJson = features ? JSON.stringify(features) : null;

    const [result] = await db.query(
      `INSERT INTO properties 
            (owner_id, name, property_type_id, property_no, street, city, district, image_url, description, features) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      typeName: row.type_name, // Alias from SQL
      image: row.image_url,
      description: row.description,
      features: row.features || [],
      uniqueId: row.unique_id, // If it exists
      status: row.status,
      createdAt: row.created_at,
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
      image: rows[0].image_url,
      description: rows[0].description,
      features: rows[0].features || [],
      uniqueId: rows[0].unique_id,
      status: rows[0].status,
      createdAt: rows[0].created_at,
    };
  }

  async update(id, updates) {
    const fields = [];
    const values = [];

    if (updates.name) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.propertyTypeId) {
      fields.push('property_type_id = ?');
      values.push(updates.propertyTypeId);
    }

    // Address updates
    if (updates.propertyNo) {
      fields.push('property_no = ?');
      values.push(updates.propertyNo);
    }
    if (updates.street) {
      fields.push('street = ?');
      values.push(updates.street);
    }
    if (updates.city) {
      fields.push('city = ?');
      values.push(updates.city);
    }
    if (updates.district) {
      fields.push('district = ?');
      values.push(updates.district);
    }

    if (updates.imageUrl) {
      fields.push('image_url = ?');
      values.push(updates.imageUrl);
    }
    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.features !== undefined) {
      fields.push('features = ?');
      values.push(JSON.stringify(updates.features));
    }

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
    const [result] = await dbConn.query(
      "UPDATE properties SET archived_at = NOW(), is_archived = TRUE, status = 'inactive' WHERE property_id = ?",
      [id]
    );
    return result.affectedRows > 0;
  }

  async getTypes() {
    const [rows] = await db.query('SELECT * FROM property_types');
    return rows;
  }

  async addImages(propertyId, imagesData) {
    if (!imagesData || imagesData.length === 0) return [];

    const values = imagesData.map((img) => [
      img.property_id,
      img.image_url,
      img.is_primary,
      img.display_order,
    ]);

    // Bulk insert
    await db.query(
      'INSERT INTO property_images (property_id, image_url, is_primary, display_order) VALUES ?',
      [values]
    );

    // Fetch and return created images
    // For simplicity, just selecting by property_id
    const [rows] = await db.query(
      'SELECT * FROM property_images WHERE property_id = ? ORDER BY display_order ASC',
      [propertyId]
    );
    return rows;
  }
  async findOwnerDetails(propertyId) {
    const [rows] = await db.query(
      `SELECT p.name as property_name, u.email as owner_email, u.user_id as owner_id 
             FROM properties p
             JOIN users u ON p.owner_id = u.user_id
             WHERE p.property_id = ?`,
      [propertyId]
    );
    return rows[0];
  }

  async clearPrimaryImages(propertyId) {
    await db.query(
      'UPDATE property_images SET is_primary = 0 WHERE property_id = ?',
      [propertyId]
    );
    return true;
  }
}

export default new PropertyModel();
