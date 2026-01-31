import pool from '../config/db.js';

class MaintenanceCostModel {
    async findByRequestId(requestId) {
        const [rows] = await pool.query('SELECT * FROM maintenance_costs WHERE request_id = ? ORDER BY recorded_date DESC', [requestId]);
        return rows;
    }

    async findByTenantId(tenantId) {
        const [rows] = await pool.query(`
            SELECT mc.* 
            FROM maintenance_costs mc 
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id 
            WHERE mr.tenant_id = ? 
            ORDER BY mc.recorded_date DESC
        `, [tenantId]);
        return rows;
    }

    async create(data) {
        const { requestId, description, amount, recordedDate } = data;
        const [result] = await pool.query(
            'INSERT INTO maintenance_costs (request_id, description, amount, recorded_date) VALUES (?, ?, ?, ?)',
            [requestId, description, amount, recordedDate || new Date()]
        );
        return result.insertId;
    }

    async findAll() {
        const [rows] = await pool.query('SELECT * FROM maintenance_costs ORDER BY recorded_date DESC');
        return rows;
    }

    async getTotalCostByProperty(propertyId) {
        const [rows] = await pool.query(`
            SELECT SUM(mc.amount) as total_cost
            FROM maintenance_costs mc
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id
            JOIN units u ON mr.unit_id = u.unit_id
            WHERE u.property_id = ?
        `, [propertyId]);
        return rows[0].total_cost || 0;
    }
    async delete(id) {
        const [result] = await pool.query('DELETE FROM maintenance_costs WHERE cost_id = ?', [id]);
        return result.affectedRows > 0;
    }
    async findAllWithDetails() {
        const [rows] = await pool.query(`
            SELECT mc.*, p.name as property_name, p.property_id
            FROM maintenance_costs mc
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id
            JOIN units u ON mr.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            ORDER BY mc.recorded_date DESC
        `);
        return rows;
    }
}

export default new MaintenanceCostModel();
