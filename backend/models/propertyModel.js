import db from '../config/db.js';

class PropertyModel {
    async create(propertyData) {
        const { ownerId, name, propertyTypeId, propertyNo, street, city, district, imageUrl } = propertyData;

        const [result] = await db.query(
            `INSERT INTO properties 
            (owner_id, name, property_type_id, property_no, street, city, district, image_url) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [ownerId, name, propertyTypeId, propertyNo, street, city, district, imageUrl]
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
                p.status, 
                p.created_at,
                pt.name as type_name,
                pt.type_id as type_id
            FROM properties p
            LEFT JOIN property_types pt ON p.property_type_id = pt.type_id
            WHERE p.status = 'active'
        `;

        const params = [];
        if (ownerId) {
            query += ' AND p.owner_id = ?';
            params.push(ownerId);
        }

        const [rows] = await db.query(query, params);

        return rows.map(row => ({
            ...row,
            propertyNo: row.property_no,
            street: row.street,
            city: row.city,
            district: row.district
        }));
    }

    async findById(id) {
        const [rows] = await db.query(`
            SELECT 
                p.property_id, 
                p.owner_id, 
                p.name, 
                p.property_no,
                p.street,
                p.city,
                p.district,
                p.image_url, 
                p.status, 
                p.created_at,
                pt.name as type_name,
                pt.type_id as type_id
            FROM properties p
            JOIN property_types pt ON p.property_type_id = pt.type_id
            WHERE p.property_id = ?
        `, [id]);

        if (!rows[0]) return null;

        return {
            ...rows[0],
            propertyNo: rows[0].property_no,
            street: rows[0].street,
            city: rows[0].city,
            district: rows[0].district
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
