import behaviorLogModel from '../models/behaviorLogModel.js';
import tenantModel from '../models/tenantModel.js';
import pool from '../config/db.js';

export const addBehaviorLog = async (req, res) => {
  const { tenantId } = req.params;
  const { type, category, scoreChange, description, recordedBy } = req.body;

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

    res.status(201).json({
      message: 'Behavior log added successfully',
      newScore,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error adding behavior log:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    connection.release();
  }
};

export const getTenantBehavior = async (req, res) => {
  const { tenantId } = req.params;

  try {
    // Get logs
    const logs = await behaviorLogModel.findByTenantId(tenantId);

    // Get current score
    const score = await tenantModel.getBehaviorScore(tenantId);

    res.status(200).json({ score, logs });
  } catch (error) {
    console.error('Error fetching tenant behavior:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
