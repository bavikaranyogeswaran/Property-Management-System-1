// ============================================================================
//  MAINTENANCE COST MODEL (The Receipt Drawer)
// ============================================================================
//  Tracks the exact financial cost of repairs and who is paying.
// ============================================================================

import pool from '../config/db.js';
import { getLocalTime } from '../utils/dateUtils.js';

class MaintenanceCostModel {
  async findByRequestId(requestId) {
    const [rows] = await pool.query(
      'SELECT * FROM maintenance_costs WHERE request_id = ? ORDER BY recorded_date DESC',
      [requestId]
    );
    return rows.map((row) => ({
      id: row.cost_id.toString(),
      requestId: row.request_id.toString(),
      description: row.description,
      amount: Number(row.amount),
      recordedDate: row.recorded_date,
      invoiceId: row.invoice_id,
      isReimbursable: !!row.is_reimbursable,
      billTo: row.bill_to,
      status: row.status,
    }));
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
    return rows.map((row) => ({
      id: row.cost_id.toString(),
      requestId: row.request_id.toString(),
      description: row.description,
      amount: Number(row.amount),
      recordedDate: row.recorded_date,
      invoiceId: row.invoice_id,
      isReimbursable: !!row.is_reimbursable,
      billTo: row.bill_to,
      status: row.status,
    }));
  }

  async create(data, connection = null) {
    const {
      requestId,
      description,
      amount,
      recordedDate,
      invoiceId,
      isReimbursable,
      billTo,
    } = data;
    const db = connection || pool;
    const [result] = await db.query(
      'INSERT INTO maintenance_costs (request_id, description, amount, recorded_date, invoice_id, is_reimbursable, bill_to) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        requestId,
        description,
        amount,
        recordedDate || getLocalTime(),
        invoiceId || null,
        isReimbursable || false,
        billTo || 'owner',
      ]
    );
    return result.insertId;
  }

  async findAll() {
    const [rows] = await pool.query(
      'SELECT * FROM maintenance_costs ORDER BY recorded_date DESC'
    );
    return rows.map((row) => ({
      id: row.cost_id.toString(),
      requestId: row.request_id.toString(),
      description: row.description,
      amount: Number(row.amount),
      recordedDate: row.recorded_date,
      invoiceId: row.invoice_id,
      isReimbursable: !!row.is_reimbursable,
      billTo: row.bill_to,
      status: row.status,
    }));
  }

  async getTotalCostByProperty(propertyId) {
    const [rows] = await pool.query(
      `
            SELECT SUM(mc.amount) as totalCost
            FROM maintenance_costs mc
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id
            JOIN units u ON mr.unit_id = u.unit_id
            WHERE u.property_id = ?
        `,
      [propertyId]
    );
    return rows[0].totalCost || 0;
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
    return rows.map((row) => ({
      id: row.cost_id.toString(),
      requestId: row.request_id.toString(),
      description: row.description,
      amount: Number(row.amount),
      recordedDate: row.recorded_date,
      invoiceId: row.invoice_id,
      isReimbursable: !!row.is_reimbursable,
      billTo: row.bill_to,
      status: row.status,
      propertyName: row.property_name,
      propertyId: row.property_id,
    }));
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
    return rows.map((row) => ({
      id: row.cost_id.toString(),
      requestId: row.request_id.toString(),
      description: row.description,
      amount: Number(row.amount),
      recordedDate: row.recorded_date,
      invoiceId: row.invoice_id,
      isReimbursable: !!row.is_reimbursable,
      billTo: row.bill_to,
      status: row.status,
      propertyName: row.property_name,
      propertyId: row.property_id,
    }));
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
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.cost_id.toString(),
      requestId: row.request_id.toString(),
      description: row.description,
      amount: Number(row.amount),
      recordedDate: row.recorded_date,
      invoiceId: row.invoice_id,
      isReimbursable: !!row.is_reimbursable,
      billTo: row.bill_to,
      status: row.status,
      propertyId: row.property_id,
    };
  }

  // Analytics optimized query to avoid O(N) memory buildup
  async getFinancialStats(year, startDate = null, endDate = null) {
    let query = `
      SELECT p.property_id, p.name AS property_name, SUM(mc.amount) AS total_expense
      FROM maintenance_costs mc
      JOIN maintenance_requests mr ON mc.request_id = mr.request_id
      JOIN units u ON mr.unit_id = u.unit_id
      JOIN properties p ON u.property_id = p.property_id
      WHERE (mc.bill_to = 'owner' OR mc.bill_to IS NULL)
    `;
    const params = [];

    if (startDate && endDate) {
      query += ` AND mc.recorded_date BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else {
      query += ` AND YEAR(mc.recorded_date) = ?`;
      params.push(year);
    }

    query += ` GROUP BY p.property_id, p.name`;

    const [rows] = await pool.query(query, params);
    return rows;
  }
}

export default new MaintenanceCostModel();
