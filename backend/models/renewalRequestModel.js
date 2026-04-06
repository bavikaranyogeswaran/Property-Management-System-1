import pool from '../config/db.js';

class RenewalRequestModel {
  async create(data, connection = null) {
    const {
      leaseId,
      currentMonthlyRent,
      proposedMonthlyRent,
      proposedEndDate,
      status,
      notes,
    } = data;
    const conn = connection || pool;
    const [result] = await conn.query(
      `INSERT INTO renewal_requests 
             (lease_id, current_monthly_rent, proposed_monthly_rent, proposed_end_date, status, negotiation_notes)
             VALUES (?, ?, ?, ?, ?, ?)`,
      [
        leaseId,
        currentMonthlyRent,
        proposedMonthlyRent || null,
        proposedEndDate || null,
        status || 'pending',
        notes || null,
      ]
    );
    return result.insertId;
  }

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT rr.*, l.unit_id, u.unit_number, p.name as property_name, usr.name as tenant_name
             FROM renewal_requests rr
             JOIN leases l ON rr.lease_id = l.lease_id
             JOIN units u ON l.unit_id = u.unit_id
             JOIN properties p ON u.property_id = p.property_id
             JOIN users usr ON l.tenant_id = usr.user_id
             WHERE rr.request_id = ?`,
      [id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async findByLeaseId(leaseId) {
    const [rows] = await pool.query(
      `SELECT * FROM renewal_requests WHERE lease_id = ? ORDER BY created_at DESC LIMIT 1`,
      [leaseId]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async findAll(filter = {}) {
    const { ownerId, treasurerId } = filter;
    let query = `
            SELECT rr.*, l.unit_id, u.unit_number, p.name as property_name, usr.name as tenant_name
            FROM renewal_requests rr
            JOIN leases l ON rr.lease_id = l.lease_id
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            JOIN users usr ON l.tenant_id = usr.user_id
        `;
    const params = [];
    const conditions = [];

    if (ownerId) {
      conditions.push(`p.owner_id = ?`);
      params.push(ownerId);
    }

    if (treasurerId) {
      query += ` JOIN staff_property_assignments spa ON p.property_id = spa.property_id`;
      conditions.push(`spa.user_id = ?`);
      params.push(treasurerId);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY rr.created_at DESC`;
    const [rows] = await pool.query(query, params);
    return rows.map((row) => this.mapRow(row));
  }

  mapRow(row) {
    return {
      id: row.request_id.toString(),
      leaseId: row.lease_id.toString(),
      currentMonthlyRent: parseFloat(row.current_monthly_rent),
      proposedMonthlyRent: row.proposed_monthly_rent
        ? parseFloat(row.proposed_monthly_rent)
        : null,
      proposedEndDate: row.proposed_end_date,
      status: row.status,
      negotiationNotes: row.negotiation_notes,
      unitId: row.unit_id?.toString(),
      unitNumber: row.unit_number,
      propertyName: row.property_name,
      tenantName: row.tenant_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateStatus(id, status, connection = null) {
    const conn = connection || pool;
    await conn.query(
      `UPDATE renewal_requests SET status = ? WHERE request_id = ?`,
      [status, id]
    );
  }

  async updateTerms(id, data, connection = null) {
    const { proposedMonthlyRent, proposedEndDate, notes, status } = data;
    const conn = connection || pool;
    await conn.query(
      `UPDATE renewal_requests 
             SET proposed_monthly_rent = ?, proposed_end_date = ?, negotiation_notes = ?, status = ?
             WHERE request_id = ?`,
      [proposedMonthlyRent, proposedEndDate, notes, status || 'negotiating', id]
    );
  }
}

export default new RenewalRequestModel();
