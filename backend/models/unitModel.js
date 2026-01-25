import db from '../config/db.js';

class UnitModel {
    async create(data) {
        // data: propertyId, unitNumber, unitTypeId, monthlyRent, status, imageUrl
        const { propertyId, unitNumber, unitTypeId, monthlyRent, status, imageUrl } = data;
        const [result] = await db.query(
            `INSERT INTO units (property_id, unit_number, unit_type_id, monthly_rent, status, image_url)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [propertyId, unitNumber, unitTypeId, monthlyRent, status || 'available', imageUrl]
        );
        return result.insertId;
    }

    async findAll() {
        const [rows] = await db.query(`
            SELECT u.*, 
                   p.name as property_name, 
                   ut.name as type_name
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            ORDER BY u.created_at DESC
        `);
        return this.mapRows(rows);
    }

    async findById(id) {
        const [rows] = await db.query(`
            SELECT u.*, 
                   p.name as property_name, 
                   ut.name as type_name
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            WHERE u.unit_id = ?
        `, [id]);
        if (rows.length === 0) return null;
        return this.mapRows(rows)[0];
    }

    async findByPropertyId(propertyId) {
        const [rows] = await db.query(`
            SELECT u.*, 
                   p.name as property_name, 
                   ut.name as type_name
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            WHERE u.property_id = ?
            ORDER BY u.unit_number ASC
        `, [propertyId]);
        return this.mapRows(rows);
    }

    async update(id, updates) {
        const fields = [];
        const values = [];

        if (updates.unitNumber) { fields.push('unit_number = ?'); values.push(updates.unitNumber); }
        if (updates.unitTypeId) { fields.push('unit_type_id = ?'); values.push(updates.unitTypeId); }
        if (updates.monthlyRent) { fields.push('monthly_rent = ?'); values.push(updates.monthlyRent); }
        if (updates.status) { fields.push('status = ?'); values.push(updates.status); }
        if (updates.imageUrl) { fields.push('image_url = ?'); values.push(updates.imageUrl); }

        if (fields.length === 0) return false;

        values.push(id);
        const [result] = await db.query(
            `UPDATE units SET ${fields.join(', ')} WHERE unit_id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async delete(id) {
        // Hard delete or soft delete? propertyModel uses soft delete 'inactive' but units schema might not have it.
        // Schema checks: status enum('available','occupied','maintenance'). No 'inactive'.
        // So we might default to hard delete checking constraints.
        // Assuming cascade or restriction.
        const [result] = await db.query('DELETE FROM units WHERE unit_id = ?', [id]);
        return result.affectedRows > 0;
    }

    mapRows(rows) {
        return rows.map(row => ({
            id: row.unit_id.toString(),
            propertyId: row.property_id.toString(),
            unitNumber: row.unit_number,
            unitTypeId: row.unit_type_id,
            type: row.type_name,
            monthlyRent: parseFloat(row.monthly_rent),
            status: row.status,
            image: row.image_url,
            createdAt: row.created_at,
            propertyName: row.property_name
        }));
    }
}

export default new UnitModel();
