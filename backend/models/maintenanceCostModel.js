import pool from '../config/db.js';
import { getLocalTime } from '../utils/dateUtils.js';

class MaintenanceCostModel {
  async findByRequestId(requestId) {
    const [rows] = await pool.query(
      'SELECT * FROM maintenance_costs WHERE request_id = ? ORDER BY recorded_date DESC',
      [requestId]
    );
    return rows;
  }

  async findByTenantId(tenantId) {
    const [rows] = await pool.query(
      `
            SELECT mc.* 
            FROM maintenance_costs mc 
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id 
            WHERE mr.tenant_id = ? 
            ORDER BY mc.recorded_date DESC
        `,
      [tenantId]
    );
    return rows;
  }

  async create(data, connection = null) {
    const { requestId, description, amount, recordedDate } = data;
    const db = connection || pool;
    const [result] = await db.query(
      'INSERT INTO maintenance_costs (request_id, description, amount, recorded_date) VALUES (?, ?, ?, ?)',
      [requestId, description, amount, recordedDate || getLocalTime()]
    );
    return result.insertId;
  }

  async findAll() {
    const [rows] = await pool.query(
      'SELECT * FROM maintenance_costs ORDER BY recorded_date DESC'
    );
    return rows;
  }

  async getTotalCostByProperty(propertyId) {
    const [rows] = await pool.query(
      `
            SELECT SUM(mc.amount) as total_cost
            FROM maintenance_costs mc
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id
            JOIN units u ON mr.unit_id = u.unit_id
            WHERE u.property_id = ?
        `,
      [propertyId]
    );
    return rows[0].total_cost || 0;
  }
  async void(id) {
    const [result] = await pool.query(
      "UPDATE maintenance_costs SET status = 'voided' WHERE cost_id = ?",
      [id]
    );
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

  async findByTreasurerId(userId) {
    const [rows] = await pool.query(
      `
            SELECT mc.*, p.name as property_name
            FROM maintenance_costs mc 
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id 
            JOIN units u ON mr.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            JOIN staff_property_assignments spa ON p.property_id = spa.property_id
            WHERE spa.user_id = ?
            ORDER BY mc.recorded_date DESC
        `,
      [userId]
    );
    return rows;
  }

  async findByIdWithDetails(costId) {
    const [rows] = await pool.query(
      `
      SELECT mc.*, u.property_id
      FROM maintenance_costs mc
      JOIN maintenance_requests mr ON mc.request_id = mr.request_id
      JOIN units u ON mr.unit_id = u.unit_id
      WHERE mc.cost_id = ?
      `,
      [costId]
    );
    return rows[0];
  }

  // Analytics optimized query to avoid O(N) memory buildup
  async getFinancialStatsByYear(year) {
    const [rows] = await pool.query(
      `
      SELECT p.name AS property_name, SUM(mc.amount) AS total_expense
      FROM maintenance_costs mc
      JOIN maintenance_requests mr ON mc.request_id = mr.request_id
      JOIN units u ON mr.unit_id = u.unit_id
      JOIN properties p ON u.property_id = p.property_id
      WHERE YEAR(mc.recorded_date) = ?
      GROUP BY p.property_id
      `,
      [year]
    );
    return rows;
  }
}

export default new MaintenanceCostModel();
