import pool from '../config/db.js';

class MaintenanceRequestModel {
    async findAll() {
        const [rows] = await pool.query('SELECT * FROM maintenance_requests ORDER BY created_at DESC');
        return rows;
    }

    async findById(id) {
        const [rows] = await pool.query('SELECT * FROM maintenance_requests WHERE request_id = ?', [id]);
        return rows[0];
    }

    async findByPropertyId(propertyId) {
        const [rows] = await pool.query(`
            SELECT mr.* 
            FROM maintenance_requests mr
            JOIN units u ON mr.unit_id = u.unit_id
            WHERE u.property_id = ?
            ORDER BY mr.created_at DESC
        `, [propertyId]);
        return rows;
    }

    async findByTenantId(tenantId) {
        const [rows] = await pool.query('SELECT * FROM maintenance_requests WHERE tenant_id = ? ORDER BY created_at DESC', [tenantId]);
        return rows;
    }

    async create(data) {
        const { unitId, LtenantId, title, description, priority, images } = data;
        const [result] = await pool.query(
            'INSERT INTO maintenance_requests (unit_id, tenant_id, title, description, priority, images, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [unitId, LtenantId, title, description, priority || 'medium', JSON.stringify(images || []), 'submitted']
        );
        return result.insertId;
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
