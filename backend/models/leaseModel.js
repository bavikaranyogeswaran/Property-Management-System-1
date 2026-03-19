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
      `INSERT INTO leases (tenant_id, unit_id, start_date, end_date, monthly_rent, status, security_deposit, deposit_status, document_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        unitId,
        startDate,
        endDate,
        monthlyRent,
        status || 'active',
        securityDeposit || 0.0,
        depositStatus || 'pending',
        data.documentUrl || null,
      ]
    );
    return result.insertId;
  }
  // Whitelist of columns that can be updated via the dynamic update method
  static ALLOWED_UPDATE_FIELDS = [
    'tenant_id', 'unit_id', 'start_date', 'end_date',
    'monthly_rent', 'status', 'security_deposit',
    'deposit_status', 'refunded_amount', 'document_url',
    'proposed_refund_amount', 'refund_notes', 'notice_status',
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
      `UPDATE leases SET ${fields.join(', ')} WHERE lease_id = ? AND deleted_at IS NULL`,
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
            JOIN properties p ON u.property_id = p.property_id
            WHERE l.deleted_at IS NULL`;
    const params = [];

    if (ownerId) {
      query += ` AND p.owner_id = ?`;
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
            WHERE l.lease_id = ? AND l.deleted_at IS NULL
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
            WHERE l.tenant_id = ? AND l.deleted_at IS NULL
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
            WHERE l.status = 'active' AND l.deleted_at IS NULL
        `);
    return this.mapRows(rows);
  }

  async checkOverlap(unitId, startDate, endDate, excludeLeaseId = null, connection = null) {
    const dbConn = connection || db;
    let query = `
            SELECT lease_id FROM leases 
            WHERE unit_id = ? 
            AND status IN ('active', 'pending', 'draft')
            AND deleted_at IS NULL
            AND start_date <= ? 
            AND (end_date IS NULL OR end_date >= ?)`;
    const params = [unitId, endDate || '2099-12-31', startDate];

    if (excludeLeaseId) {
      query += ` AND lease_id != ?`;
      params.push(excludeLeaseId);
    }

    const [rows] = await dbConn.query(query, params);
    return rows.length > 0;
  }

  async delete(id, connection = null) {
    const dbConn = connection || db;
    const [result] = await dbConn.query(
      "UPDATE leases SET deleted_at = NOW(), status = 'cancelled' WHERE lease_id = ?",
      [id]
    );
    return result.affectedRows > 0;
  }
  
  async countActiveByUnitId(unitId, connection = null) {
    const dbConn = connection || db;
    const [rows] = await dbConn.query(
      `SELECT COUNT(*) as count FROM leases 
       WHERE unit_id = ? 
       AND status IN ('active', 'pending', 'draft')
       AND deleted_at IS NULL`,
      [unitId]
    );
    return rows[0].count;
  }

  async countActiveByPropertyId(propertyId, connection = null) {
    const dbConn = connection || db;
    const [rows] = await dbConn.query(
      `SELECT COUNT(*) as count FROM leases l
       JOIN units u ON l.unit_id = u.unit_id
       WHERE u.property_id = ? 
       AND l.status IN ('active', 'pending', 'draft')
       AND l.deleted_at IS NULL`,
      [propertyId]
    );
    return rows[0].count;
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
      proposedRefundAmount: parseFloat(row.proposed_refund_amount || 0),
      refundNotes: row.refund_notes,
      refundedAmount: parseFloat(row.refunded_amount || 0),
      documentUrl: row.document_url,
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
