// ============================================================================
//  UNIT IMAGE MODEL (The Unit Photo Album)
// ============================================================================
//  Connects individual rental units with their images.
// ============================================================================

import db from '../config/db.js';

class UnitImageModel {
  // CREATE MULTIPLE: Batch uploads a set of image URLs for a specific rental unit.
  async createMultiple(unitId, images) {
    if (!images || images.length === 0) return [];

    // 1. [DATA] Transformation: Preparing flat array for bulk SQL insertion
    const values = images.map((img, index) => [
      unitId,
      img.imageUrl,
      img.isPrimary || false,
      img.displayOrder !== undefined ? img.displayOrder : index,
    ]);

    const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
    const flatValues = values.flat();

    // 2. [DATA] Persistence: Bulk insert to optimize database round-trips
    const [result] = await db.query(
      `INSERT INTO unit_images (unit_id, image_url, is_primary, display_order) 
             VALUES ${placeholders}`,
      flatValues
    );

    return result.insertId;
  }

  // FIND BY UNIT ID: Retrieves the photo gallery for a specific apartment or room.
  async findByUnitId(unitId) {
    // 1. [QUERY] Sorted Retrieval: ordered by custom display sequence
    const [rows] = await db.query(
      `SELECT image_id, unit_id, image_url, is_primary, display_order, created_at
             FROM unit_images 
             WHERE unit_id = ?
             ORDER BY display_order ASC, created_at ASC`,
      [unitId]
    );
    return rows;
  }

  // DELETE BY UNIT ID: Full gallery purge (typically used when a unit is removed or reset).
  async deleteByUnitId(unitId) {
    // 1. [DATA] Cleanup
    const [result] = await db.query(
      'DELETE FROM unit_images WHERE unit_id = ?',
      [unitId]
    );
    return result.affectedRows;
  }

  // SET PRIMARY: Rotates the 'Primary/Cover' flag for a unit's gallery.
  async setPrimary(imageId, unitId) {
    // 1. [UNSET] Status Cleansing: Clear current primary status across all images for this unit
    await db.query(
      'UPDATE unit_images SET is_primary = FALSE WHERE unit_id = ?',
      [unitId]
    );

    // 2. [SET] Flag Application: Assign the primary status to the specific chosen image
    const [result] = await db.query(
      'UPDATE unit_images SET is_primary = TRUE WHERE image_id = ? AND unit_id = ?',
      [imageId, unitId]
    );

    return result.affectedRows > 0;
  }

  // DELETE BY ID: Removes a single image from a unit's gallery.
  async deleteById(imageId) {
    // 1. [DATA] Selective Cleanup
    const [result] = await db.query(
      'DELETE FROM unit_images WHERE image_id = ?',
      [imageId]
    );
    return result.affectedRows > 0;
  }
}

export default new UnitImageModel();
