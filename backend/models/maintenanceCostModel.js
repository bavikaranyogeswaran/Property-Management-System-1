// ============================================================================
//  MAINTENANCE COST MODEL (The Receipt Drawer)
// ============================================================================
//  Tracks the exact financial cost of repairs and who is paying.
// ============================================================================

import pool from '../config/db.js';
import { getLocalTime } from '../utils/dateUtils.js';

class MaintenanceCostModel {
  // FIND BY REQUEST ID: Retrieves a detailed ledger of all expenses tied to a specific ticket.
  async findByRequestId(requestId) {
    // 1. [QUERY] Construction: Sorting by most recent recorded date
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

  // FIND BY TENANT ID: Fetches repair costs that the tenant might be liable for or associated with.
  async findByTenantId(tenantId) {
    // 1. [QUERY] Joined Retrieval: Resolves costs through the parent maintenance request
    const [rows] = await pool.query(
      `SELECT mc.* 
       FROM maintenance_costs mc 
       JOIN maintenance_requests mr ON mc.request_id = mr.request_id 
       WHERE mr.tenant_id = ? 
       ORDER BY mc.recorded_date DESC`,
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

  // CREATE: Records a new expenditure for a repair or upgrade.
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
    // 1. [DATA] Persistence: Insert the cost record with specified liability delegation (bill_to)
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

  // FIND ALL: System-wide registry of maintenance expenditures.
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

  // GET TOTAL COST BY PROPERTY: Aggregates total maintenance spending for a property's financial report.
  async getTotalCostByProperty(propertyId) {
    // 1. [QUERY] Aggregation: Sums amounts through the units-to-requests link
    const [rows] = await pool.query(
      `SELECT SUM(mc.amount) as totalCost
       FROM maintenance_costs mc
       JOIN maintenance_requests mr ON mc.request_id = mr.request_id
       JOIN units u ON mr.unit_id = u.unit_id
       WHERE u.property_id = ?`,
      [propertyId]
    );
    return rows[0].totalCost || 0;
  }

  // VOID: Soft-cancellation of an erroneously recorded cost.
  async void(id) {
    // 1. [DATA] State Persistence
    const [result] = await pool.query(
      "UPDATE maintenance_costs SET status = 'voided' WHERE cost_id = ?",
      [id]
    );
    return result.affectedRows > 0;
  }

  // FIND ALL WITH DETAILS: Global listing enriched with property context for admin dashboards.
  async findAllWithDetails() {
    // 1. [QUERY] Multi-Join Retrieval
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

  // FIND BY TREASURER: Limits expenditure view to properties assigned to the specific treasurer.
  async findByTreasurerId(userId) {
    // 1. [QUERY] Filtered Join: Resolves costs through property-staff assignments
    const [rows] = await pool.query(
      `SELECT mc.*, p.name as property_name
       FROM maintenance_costs mc 
       JOIN maintenance_requests mr ON mc.request_id = mr.request_id 
       JOIN units u ON mr.unit_id = u.unit_id
       JOIN properties p ON u.property_id = p.property_id
       JOIN staff_property_assignments spa ON p.property_id = spa.property_id
       WHERE spa.user_id = ?
       ORDER BY mc.recorded_date DESC`,
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

  // FIND BY ID WITH DETAILS: Fetches a single cost record with property ownership context.
  async findByIdWithDetails(costId) {
    // 1. [QUERY] Direct Retrieval with Join
    const [rows] = await pool.query(
      `SELECT mc.*, u.property_id
       FROM maintenance_costs mc
       JOIN maintenance_requests mr ON mc.request_id = mr.request_id
       JOIN units u ON mr.unit_id = u.unit_id
       WHERE mc.cost_id = ?`,
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

  // FINANCIAL STATS: High-performance aggregation for portfolio-wide expense reporting.
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

    // 1. [QUERY] Filter Application
    if (startDate && endDate) {
      query += ` AND mc.recorded_date BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else {
      query += ` AND YEAR(mc.recorded_date) = ?`;
      params.push(year);
    }

    query += ` GROUP BY p.property_id, p.name`;

    // 2. [DATA] Collection
    const [rows] = await pool.query(query, params);
    return rows;
  }
}

export default new MaintenanceCostModel();
