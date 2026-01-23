import db from '../config/db.js';

class UnitImageModel {
    async createMultiple(unitId, images) {
        // images: array of { imageUrl, isPrimary, displayOrder }
        if (!images || images.length === 0) return [];

        const values = images.map((img, index) => [
            unitId,
            img.imageUrl,
            img.isPrimary || false,
            img.displayOrder !== undefined ? img.displayOrder : index
        ]);

        const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
        const flatValues = values.flat();

        const [result] = await db.query(
            `INSERT INTO unit_images (unit_id, image_url, is_primary, display_order) 
             VALUES ${placeholders}`,
            flatValues
        );

        return result.insertId;
    }

    async findByUnitId(unitId) {
        const [rows] = await db.query(
            `SELECT 
                image_id,
                unit_id,
                image_url,
                is_primary,
                display_order,
                created_at
             FROM unit_images 
             WHERE unit_id = ?
             ORDER BY display_order ASC, created_at ASC`,
            [unitId]
        );
        return rows;
    }

    async deleteByUnitId(unitId) {
        const [result] = await db.query(
            'DELETE FROM unit_images WHERE unit_id = ?',
            [unitId]
        );
        return result.affectedRows;
    }

    async setPrimary(imageId, unitId) {
        // First, unset all primary flags for this unit
        await db.query(
            'UPDATE unit_images SET is_primary = FALSE WHERE unit_id = ?',
            [unitId]
        );

        // Then set the specified image as primary
        const [result] = await db.query(
            'UPDATE unit_images SET is_primary = TRUE WHERE image_id = ? AND unit_id = ?',
            [imageId, unitId]
        );

        return result.affectedRows > 0;
    }

    async deleteById(imageId) {
        const [result] = await db.query(
            'DELETE FROM unit_images WHERE image_id = ?',
            [imageId]
        );
        return result.affectedRows > 0;
    }
}

export default new UnitImageModel();
