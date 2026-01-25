import db from '../config/db.js';

class PropertyModel {
    async create(propertyData) {
        const { ownerId, name, propertyTypeId, addressLine1, addressLine2, addressLine3, imageUrl } = propertyData;

        // Combine address lines
        const address = [addressLine1, addressLine2, addressLine3].filter(Boolean).join(', ');

        const [result] = await db.query(
            `INSERT INTO properties 
            (owner_id, name, property_type_id, address, image_url) 
            VALUES (?, ?, ?, ?, ?)`,
            [ownerId, name, propertyTypeId, address, imageUrl]
        );
        return result.insertId;
    }

    async findAll() {
        const [rows] = await db.query(`
            SELECT 
                p.property_id, 
                p.owner_id, 
                p.name, 
                p.address, 
                p.image_url, 
                p.status, 
                p.created_at,
                pt.name as type_name,
                pt.type_id as type_id
            FROM properties p
            JOIN property_types pt ON p.property_type_id = pt.type_id
            WHERE p.status = 'active'
        `);

        return rows.map(row => ({
            ...row,
            address_line_1: row.address, // Map back to what frontend expects somewhat? 
            // Actually frontend expects addressLine1 (camelCase) from the mapped result in AppContext?
            // Wait, AppContext maps `address_line_1` -> `addressLine1`.
            // So we should return snake_case keys that match AppContext map or update AppContext.
            // AppContext: `addressLine1: p.address_line_1`
            // So we return `address_line_1: row.address`.
            address_line_1: row.address,
            address_line_2: '',
            address_line_3: ''
        }));
    }

    async findById(id) {
        const [rows] = await db.query(`
            SELECT 
                p.property_id, 
                p.owner_id, 
                p.name, 
                p.address, 
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
            address_line_1: rows[0].address,
            address_line_2: '',
            address_line_3: ''
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

        // Handle address update if any line is provided
        if (updates.addressLine1 !== undefined || updates.addressLine2 !== undefined || updates.addressLine3 !== undefined) {
            // We need to fetch current to merge? Or just overwrite?
            // Simple approach: If any address part is updated, we might overwrite. 
            // But simpler: just accept `addressLine1` as the new full address if simple update, 
            // OR construct if we have valid input.
            // Given the context, we should probably just look at what's passed.
            // If we want to be robust, we'd need to fetch -> merge -> save.
            // For now, let's assume `addressLine1` is the main one or if we have all 3.
            // Let's concat what's provided.
            const parts = [updates.addressLine1, updates.addressLine2, updates.addressLine3].filter(x => x);
            if (parts.length > 0) {
                fields.push('address = ?');
                values.push(parts.join(', '));
            }
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
