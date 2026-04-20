// ============================================================================
//  PROPERTY IMAGE MODEL (The Property Photo Album)
// ============================================================================
//  Connects properties with their Cloudinary hosted images.
// ============================================================================

import db from '../config/db.js';

class PropertyImageModel {
  // CREATE MULTIPLE: Batch uploads a set of image URLs for a property listing.
  async createMultiple(propertyId, images) {
    if (!images || images.length === 0) return [];

    // 1. [DATA] Transformation: Preparing flat array for bulk SQL insertion
    const values = images.map((img, index) => [
      propertyId,
      img.imageUrl,
      img.isPrimary || false,
      img.displayOrder !== undefined ? img.displayOrder : index,
    ]);

    const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
    const flatValues = values.flat();

    // 2. [DATA] Persistence: Bulk insert to optimize database round-trips
    const [result] = await db.query(
      `INSERT INTO property_images (property_id, image_url, is_primary, display_order) 
             VALUES ${placeholders}`,
      flatValues
    );

    return result.insertId;
  }

  // FIND BY PROPERTY ID: Retrieves the photo gallery for a specific building.
  async findByPropertyId(propertyId) {
    // 1. [QUERY] Sorted Retrieval: ordered by custom display sequence
    const [rows] = await db.query(
      `SELECT image_id, property_id, image_url, is_primary, display_order, created_at
             FROM property_images 
             WHERE property_id = ?
             ORDER BY display_order ASC, created_at ASC`,
      [propertyId]
    );
    return rows;
  }

  // DELETE BY PROPERTY ID: Full gallery purge (typically used when a property is decommissioned).
  async deleteByPropertyId(propertyId) {
    // 1. [DATA] Cleanup
    const [result] = await db.query(
      'DELETE FROM property_images WHERE property_id = ?',
      [propertyId]
    );
    return result.affectedRows;
  }

  // SET PRIMARY: Rotates the 'Primary/Cover' flag for a property's gallery.
  async setPrimary(imageId, propertyId) {
    // 1. [UNSET] Status Cleansing: Clear current primary status across all images for this property
    await db.query(
      'UPDATE property_images SET is_primary = FALSE WHERE property_id = ?',
      [propertyId]
    );

    // 2. [SET] Flag Application: Assign the primary status to the specific chosen image
    const [result] = await db.query(
      'UPDATE property_images SET is_primary = TRUE WHERE image_id = ? AND property_id = ?',
      [imageId, propertyId]
    );

    return result.affectedRows > 0;
  }

  // DELETE BY ID: Removes a single image from a property gallery.
  async deleteById(imageId) {
    // 1. [DATA] Selective Cleanup
    const [result] = await db.query(
      'DELETE FROM property_images WHERE image_id = ?',
      [imageId]
    );
    return result.affectedRows > 0;
  }
}

export default new PropertyImageModel();
