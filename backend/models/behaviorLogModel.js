import pool from '../config/db.js';

class BehaviorLogModel {
    async create(logData, connection) {
        const {
            tenantId, type, category, scoreChange, description, recordedBy
        } = logData;

        // Use transaction connection if provided, otherwise default pool
        const db = connection || pool;

        const query = `
            INSERT INTO tenant_behavior_logs 
            (tenant_id, type, category, score_change, description, recorded_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.query(query, [
            tenantId, type, category, scoreChange, description, recordedBy
        ]);

        return result.insertId;
    }

    async findByTenantId(tenantId) {
        const query = `
            SELECT * FROM tenant_behavior_logs 
            WHERE tenant_id = ? 
            ORDER BY created_at DESC
        `;
        const [rows] = await pool.query(query, [tenantId]);
        return rows;
    }
}

export default new BehaviorLogModel();
