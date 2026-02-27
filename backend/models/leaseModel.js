// ============================================================================
//  LEASE MODEL (The Contract Cabinet)
// ============================================================================
//  This file holds all the signed rental agreements.
//  It knows who lives where, for how long, and how much they pay.
// ============================================================================

import db from '../config/db.js';

class LeaseModel {
  //  CREATE LEASE: Filing a new contract.
  async create(data, connection = null) {
    const {
      tenantId,
      unitId,
      startDate,
      endDate,
      monthlyRent,
      status,
      securityDeposit,
      depositStatus,
    } = data;
    const dbConn = connection || db;
    const [result] = await dbConn.query(
      `INSERT INTO leases (tenant_id, unit_id, start_date, end_date, monthly_rent, status, security_deposit, deposit_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        unitId,
        startDate,
        endDate,
        monthlyRent,
        status || 'active',
        securityDeposit || 0.0,
        depositStatus || 'pending',
      ]
    );
    return result.insertId;
  }
  // Whitelist of columns that can be updated via the dynamic update method
  static ALLOWED_UPDATE_FIELDS = [
    'tenant_id', 'unit_id', 'start_date', 'end_date',
    'monthly_rent', 'status', 'security_deposit',
    'deposit_status', 'refunded_amount',
  ];

  async update(id, data, connection = null) {
    const dbConn = connection || db;
    // Build dynamic query with whitelisted fields only
    const fields = [];
    const values = [];
    Object.keys(data).forEach((key) => {
      if (LeaseModel.ALLOWED_UPDATE_FIELDS.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    });
    values.push(id);

    if (fields.length === 0) return false;

    const [result] = await dbConn.query(
      `UPDATE leases SET ${fields.join(', ')} WHERE lease_id = ?`,
      values
    );
    return result.affectedRows > 0;
  }

  async findAll(ownerId = null) {
    let query = `
            SELECT l.*, 
                   u.unit_number,
                   u.property_id,
                   p.name as property_name
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id`;
    const params = [];

    if (ownerId) {
      query += ` WHERE p.owner_id = ?`;
      params.push(ownerId);
    }

    query += ` ORDER BY l.created_at DESC`;

    const [rows] = await db.query(query, params);
    return this.mapRows(rows);
  }

  async findById(id) {
    const [rows] = await db.query(
      `
            SELECT l.*, 
                   u.unit_number,
                   u.property_id,
                   p.name as property_name
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            WHERE l.lease_id = ?
        `,
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapRows(rows)[0];
  }

  async findByTenantId(tenantId) {
    const [rows] = await db.query(
      `
            SELECT l.*, 
                   u.unit_number,
                   u.property_id,
                   p.name as property_name
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            WHERE l.tenant_id = ?
        `,
      [tenantId]
    );
    return this.mapRows(rows);
  }

  async findActive() {
    const [rows] = await db.query(`
            SELECT l.*, 
                   u.unit_number,
                   u.property_id,
                   p.name as property_name
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            WHERE l.status = 'active'
        `);
    return this.mapRows(rows);
  }

  async checkOverlap(unitId, startDate, endDate) {
    const [rows] = await db.query(
      `
            SELECT lease_id FROM leases 
            WHERE unit_id = ? 
            AND status IN ('active', 'pending')
            AND start_date <= ? 
            AND end_date >= ?
        `,
      [unitId, endDate, startDate]
    );
    return rows.length > 0;
  }

  mapRows(rows) {
    return rows.map((row) => ({
      id: row.lease_id.toString(),
      tenantId: row.tenant_id.toString(),
      unitId: row.unit_id.toString(),
      startDate: this.formatDate(row.start_date),
      endDate: this.formatDate(row.end_date),
      monthlyRent: parseFloat(row.monthly_rent),
      status: row.status,
      securityDeposit: parseFloat(row.security_deposit || 0),
      depositStatus: row.deposit_status,
      refundedAmount: parseFloat(row.refunded_amount || 0),
      createdAt: row.created_at,
      // Extra info useful for frontend listing
      unitNumber: row.unit_number,
      propertyId: row.property_id.toString(),
      propertyName: row.property_name,
    }));
  }

  formatDate(date) {
    if (!date) return null;
    // Adjust for timezone offset to ensure we get the local YYYY-MM-DD
    const d = new Date(date);
    const offset = d.getTimezoneOffset() * 60000;
    const localDate = new Date(d.getTime() - offset);
    return localDate.toISOString().split('T')[0];
  }
}

export default new LeaseModel();
