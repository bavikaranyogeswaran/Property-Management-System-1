// ============================================================================
//  PROPERTY IMAGE MODEL (The Property Photo Album)
// ============================================================================
//  Connects properties with their Cloudinary hosted images.
// ============================================================================

import db from '../config/db.js';

class PropertyImageModel {
  async createMultiple(propertyId, images) {
    // images: array of { imageUrl, isPrimary, displayOrder }
    if (!images || images.length === 0) return [];

    const values = images.map((img, index) => [
      propertyId,
      img.imageUrl,
      img.isPrimary || false,
      img.displayOrder !== undefined ? img.displayOrder : index,
    ]);

    const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
    const flatValues = values.flat();

    const [result] = await db.query(
      `INSERT INTO property_images (property_id, image_url, is_primary, display_order) 
             VALUES ${placeholders}`,
      flatValues
    );

    return result.insertId;
  }

  async findByPropertyId(propertyId) {
    const [rows] = await db.query(
      `SELECT 
                image_id,
                property_id,
                image_url,
                is_primary,
                display_order,
                created_at
             FROM property_images 
             WHERE property_id = ?
             ORDER BY display_order ASC, created_at ASC`,
      [propertyId]
    );
    return rows;
  }

  async deleteByPropertyId(propertyId) {
    const [result] = await db.query(
      'DELETE FROM property_images WHERE property_id = ?',
      [propertyId]
    );
    return result.affectedRows;
  }

  async setPrimary(imageId, propertyId) {
    // First, unset all primary flags for this property
    await db.query(
      'UPDATE property_images SET is_primary = FALSE WHERE property_id = ?',
      [propertyId]
    );

    // Then set the specified image as primary
    const [result] = await db.query(
      'UPDATE property_images SET is_primary = TRUE WHERE image_id = ? AND property_id = ?',
      [imageId, propertyId]
    );

    return result.affectedRows > 0;
  }

  async deleteById(imageId) {
    const [result] = await db.query(
      'DELETE FROM property_images WHERE image_id = ?',
      [imageId]
    );
    return result.affectedRows > 0;
  }
}

export default new PropertyImageModel();
