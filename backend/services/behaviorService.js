
import behaviorLogModel from '../models/behaviorLogModel.js';
import tenantModel from '../models/tenantModel.js';
import pool from '../config/db.js';

class BehaviorService {
    
    async addBehaviorLog(data, tenantId) {
        const { type, category, scoreChange, description, recordedBy } = data;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // 1. Create Log
            await behaviorLogModel.create(
                {
                    tenantId,
                    type,
                    category,
                    scoreChange,
                    description,
                    recordedBy,
                },
                connection
            );

            // 2. Update Tenant Score
            await tenantModel.incrementBehaviorScore(tenantId, scoreChange, connection);

            // 3. Fetch updated score
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

    async getTenantBehavior(tenantId) {
        const logs = await behaviorLogModel.findByTenantId(tenantId);
        const score = await tenantModel.getBehaviorScore(tenantId);
        return { score, logs };
    }
}

export default new BehaviorService();
