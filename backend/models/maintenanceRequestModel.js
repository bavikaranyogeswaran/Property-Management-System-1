import pool from '../config/db.js';

class MaintenanceRequestModel {
    async findAll() {
        const [rows] = await pool.query(`
            SELECT mr.*, 
            COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', mi.image_id, 'url', mi.image_url)) 
                 FROM maintenance_images mi 
                 WHERE mi.request_id = mr.request_id),
                JSON_ARRAY()
            ) as images
            FROM maintenance_requests mr 
            ORDER BY mr.created_at DESC
        `);
        return rows;
    }

    async findById(id) {
        const [rows] = await pool.query(`
            SELECT mr.*, 
            COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', mi.image_id, 'url', mi.image_url)) 
                 FROM maintenance_images mi 
                 WHERE mi.request_id = mr.request_id),
                JSON_ARRAY()
            ) as images
            FROM maintenance_requests mr 
            WHERE mr.request_id = ?
        `, [id]);
        return rows[0];
    }

    async findByPropertyId(propertyId) {
        const [rows] = await pool.query(`
            SELECT mr.*,
            COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', mi.image_id, 'url', mi.image_url)) 
                 FROM maintenance_images mi 
                 WHERE mi.request_id = mr.request_id),
                JSON_ARRAY()
            ) as images
            FROM maintenance_requests mr
            JOIN units u ON mr.unit_id = u.unit_id
            WHERE u.property_id = ?
            ORDER BY mr.created_at DESC
        `, [propertyId]);
        return rows;
    }

    async findByTenantId(tenantId) {
        const [rows] = await pool.query(`
            SELECT mr.*,
            COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', mi.image_id, 'url', mi.image_url)) 
                 FROM maintenance_images mi 
                 WHERE mi.request_id = mr.request_id),
                JSON_ARRAY()
            ) as images
            FROM maintenance_requests mr 
            WHERE mr.tenant_id = ? 
            ORDER BY mr.created_at DESC
        `, [tenantId]);
        return rows;
    }

    async create(data) {
        const { unitId, tenantId, title, description, priority, images } = data;

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [result] = await connection.query(
                'INSERT INTO maintenance_requests (unit_id, tenant_id, title, description, priority, status) VALUES (?, ?, ?, ?, ?, ?)',
                [unitId, tenantId, title, description, priority || 'medium', 'submitted']
            );
            const requestId = result.insertId;

            if (images && images.length > 0) {
                const imageValues = images.map(url => [requestId, url]);
                await connection.query(
                    'INSERT INTO maintenance_images (request_id, image_url) VALUES ?',
                    [imageValues]
                );
            }

            await connection.commit();
            return requestId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async updateStatus(id, status) {
        await pool.query('UPDATE maintenance_requests SET status = ? WHERE request_id = ?', [status, id]);
        return this.findById(id);
    }

    async update(id, data) {
        // Generic update if needed, currently mainly status
        // Add more fields as needed
        const { status } = data;
        if (status) {
            await pool.query('UPDATE maintenance_requests SET status = ? WHERE request_id = ?', [status, id]);
        }
        return this.findById(id);
    }
}

export default new MaintenanceRequestModel();
