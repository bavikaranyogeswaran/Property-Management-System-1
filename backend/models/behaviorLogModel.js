// ============================================================================
//  BEHAVIOR LOG MODEL (The Conduct Ledger)
// ============================================================================
//  Saves the history of good and bad scores for each tenant.
// ============================================================================

import pool from '../config/db.js';

class BehaviorLogModel {
  // CREATE: Saves a new behavior event (positive or negative) to the ledger.
  async create(logData, connection) {
    const { tenantId, type, category, scoreChange, description, recordedBy } =
      logData;

    // 1. [ORCHESTRATION] Connection Resolver: Use transaction connection if provided for atomicity
    const db = connection || pool;

    const query = `
            INSERT INTO tenant_behavior_logs 
            (tenant_id, type, category, score_change, description, recorded_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

    // 2. [DATA] Persistence
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

  // FIND BY TENANT ID: Retrieves the full conduct history for a specific resident.
  async findByTenantId(tenantId) {
    // 1. [QUERY] Construction: Selecting with aliasing for camelCase consistency in JS
    const query = `
            SELECT log_id as id, tenant_id as tenantId, type, category, score_change as scoreChange, description, recorded_by as recordedBy, created_at as createdAt 
            FROM tenant_behavior_logs 
            WHERE tenant_id = ? 
            ORDER BY created_at DESC
        `;

    // 2. [DATA] Collection Retrieval
    const [rows] = await pool.query(query, [tenantId]);
    return rows;
  }

  // LOG POSITIVE PAYMENT: Automatically rewards a tenant for paying rent early/on-time.
  async logPositivePayment(tenantId, amount, connection = null) {
    const db = connection || pool;
    const scoreChange = 5;

    // 1. [DATA] Persistence: Hardcoded 'positive' marker with a standard 'Payment' bonus
    await db.query(
      `INSERT INTO tenant_behavior_logs (tenant_id, type, category, score_change, description, recorded_by, created_at)
              VALUES (?, 'positive', 'Payment', ?, 'On-time payment bonus', NULL, NOW())`,
      [tenantId, scoreChange]
    );
    return scoreChange;
  }
}

export default new BehaviorLogModel();
