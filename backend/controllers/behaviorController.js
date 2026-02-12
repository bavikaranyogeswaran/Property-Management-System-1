import behaviorLogModel from '../models/behaviorLogModel.js';
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
    // Get current score first to clamp if needed, or just add directly
    // We will just do a direct update: behavior_score = behavior_score + scoreChange
    await connection.query(
      `
            UPDATE tenants 
            SET behavior_score = behavior_score + ? 
            WHERE user_id = ?
        `,
      [scoreChange, tenantId]
    );

    // 3. Fetch updated score
    const [rows] = await connection.query(
      `
            SELECT behavior_score FROM tenants WHERE user_id = ?
        `,
      [tenantId]
    );
    const newScore = rows[0]?.behavior_score;

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
    const [rows] = await pool.query(
      `
            SELECT behavior_score FROM tenants WHERE user_id = ?
        `,
      [tenantId]
    );

    const score = rows[0]?.behavior_score || 100;

    res.status(200).json({ score, logs });
  } catch (error) {
    console.error('Error fetching tenant behavior:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
