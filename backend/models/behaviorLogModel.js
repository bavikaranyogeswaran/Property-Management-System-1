import pool from '../config/db.js';

class BehaviorLogModel {
  async create(logData, connection) {
    const { tenantId, type, category, scoreChange, description, recordedBy } =
      logData;

    // Use transaction connection if provided, otherwise default pool
    const db = connection || pool;

    const query = `
            INSERT INTO tenant_behavior_logs 
            (tenant_id, type, category, score_change, description, recorded_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

    const [result] = await db.query(query, [
      tenantId,
      type,
      category,
      scoreChange,
      description,
      recordedBy,
    ]);

    return result.insertId;
  }

  async findByTenantId(tenantId) {
    const query = `
            SELECT log_id as id, tenant_id as tenantId, type, category, score_change as scoreChange, description, recorded_by as recordedBy, created_at as createdAt 
            FROM tenant_behavior_logs 
            WHERE tenant_id = ? 
            ORDER BY created_at DESC
        `;
    const [rows] = await pool.query(query, [tenantId]);
    return rows;
  }
  async logPositivePayment(tenantId, amount, connection = null) {
    const db = connection || pool;
    const scoreChange = 5;
    await db.query(
      `INSERT INTO tenant_behavior_logs (tenant_id, type, category, score_change, description, recorded_by, created_at)
              VALUES (?, 'positive', 'Payment', ?, 'On-time payment bonus', NULL, NOW())`,
      [tenantId, scoreChange]
    );
    return scoreChange;
  }
}

export default new BehaviorLogModel();
