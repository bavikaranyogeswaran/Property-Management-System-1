import behaviorLogModel from '../models/behaviorLogModel.js';
import tenantModel from '../models/tenantModel.js';
import pool from '../config/db.js';

class BehaviorService {
  // ADD BEHAVIOR LOG: Records positive/negative tenant actions and updates their system-wide behavior score.
  async addBehaviorLog(data, tenantId) {
    const { type, category, scoreChange, description, recordedBy } = data;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. [AUDIT] Persist specific behavior event
      try {
        await behaviorLogModel.create(
          { tenantId, type, category, scoreChange, description, recordedBy },
          connection
        );
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
          throw new Error('Duplicate log detected for this category.');
        throw err;
      }

      // 2. [FINANCIAL/RISK] Impact Score: Update tenant profile with the delta change (Used for lead scoring)
      await tenantModel.incrementBehaviorScore(
        tenantId,
        scoreChange,
        connection
      );

      // 3. Resolve final score for response
      const newScore = await tenantModel.getBehaviorScore(tenantId, connection);

      await connection.commit();
      return newScore;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // GET TENANT BEHAVIOR: Resolves the aggregate risk profile and event history for a tenant.
  async getTenantBehavior(tenantId) {
    const logs = await behaviorLogModel.findByTenantId(tenantId);
    const score = await tenantModel.getBehaviorScore(tenantId);
    return { score, logs };
  }
}

export default new BehaviorService();
