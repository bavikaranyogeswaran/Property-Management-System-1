import db from '../config/db.js';

class PropertyModel {
    async create(propertyData) {
        const { ownerId, name, propertyTypeId, addressLine1, addressLine2, addressLine3, imageUrl } = propertyData;
        const [result] = await db.query(
            `INSERT INTO properties 
            (owner_id, name, property_type_id, address_line_1, address_line_2, address_line_3, image_url) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [ownerId, name, propertyTypeId, addressLine1, addressLine2, addressLine3, imageUrl]
        );
        return result.insertId;
    }

    async findAll() {
        const [rows] = await db.query(`
            SELECT 
                p.property_id, 
                p.owner_id, 
                p.name, 
                p.address_line_1, 
                p.address_line_2, 
                p.address_line_3, 
                p.image_url, 
                p.status, 
                p.created_at,
                pt.name as type_name,
                pt.type_id as type_id
            FROM properties p
            JOIN property_types pt ON p.property_type_id = pt.type_id
            WHERE p.status = 'active'
        `);
        return rows;
    }

    async findById(id) {
        const [rows] = await db.query(`
            SELECT 
                p.property_id, 
                p.owner_id, 
                p.name, 
                p.address_line_1, 
                p.address_line_2, 
                p.address_line_3, 
                p.image_url, 
                p.status, 
                p.created_at,
                pt.name as type_name,
                pt.type_id as type_id
            FROM properties p
            JOIN property_types pt ON p.property_type_id = pt.type_id
            WHERE p.property_id = ?
        `, [id]);
        return rows[0];
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
        if (updates.addressLine1) {
            fields.push('address_line_1 = ?');
            values.push(updates.addressLine1);
        }
        if (updates.addressLine2) {
            fields.push('address_line_2 = ?');
            values.push(updates.addressLine2);
        }
        // addressLine3 can be empty string/null, so we check existence of key, not truthiness if strictly needed, 
        // but typically for updates we expect a value. We can assume key presence.
        if (updates.addressLine3 !== undefined) {
            fields.push('address_line_3 = ?');
            values.push(updates.addressLine3);
        }
        if (updates.imageUrl) {
            fields.push('image_url = ?');
            values.push(updates.imageUrl);
        }
        if (updates.status) {
            fields.push('status = ?');
            values.push(updates.status);
        }

        if (fields.length === 0) return false;

        values.push(id);
        const [result] = await db.query(
            `UPDATE properties SET ${fields.join(', ')} WHERE property_id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async delete(id) {
        const [result] = await db.query(
            "UPDATE properties SET status = 'inactive' WHERE property_id = ?",
            [id]
        );
        return result.affectedRows > 0;
    }

    async getTypes() {
        const [rows] = await db.query("SELECT * FROM property_types");
        return rows;
    }
}

export default new PropertyModel();
