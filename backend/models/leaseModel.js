// ============================================================================
//  LEASE MODEL (The Contract Cabinet)
// ============================================================================
//  This file holds all the signed rental agreements.
//  It knows who lives where, for how long, and how much they pay.
// ============================================================================

import db from '../config/db.js';
import { getCurrentDateString, formatToLocalDate } from '../utils/dateUtils.js';

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
      `INSERT INTO leases (tenant_id, unit_id, start_date, end_date, monthly_rent, status, security_deposit, deposit_status, document_url, target_deposit, reservation_expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        data.targetDeposit || 0.0,
        data.reservationExpiresAt || null,
      ]
    );
    return result.insertId;
  }
  // Mapping of camelCase keys to snake_case columns
  static UPDATE_KEY_MAP = {
    tenantId: 'tenant_id',
    unitId: 'unit_id',
    startDate: 'start_date',
    endDate: 'end_date',
    monthlyRent: 'monthly_rent',
    status: 'status',
    securityDeposit: 'security_deposit',
    depositStatus: 'deposit_status',
    refundedAmount: 'refunded_amount',
    documentUrl: 'document_url',
    proposedRefundAmount: 'proposed_refund_amount',
    refundNotes: 'refund_notes',
    noticeStatus: 'notice_status',
    actualCheckoutAt: 'actual_checkout_at',
    targetDeposit: 'target_deposit',
    signedAt: 'signed_at',
    isDocumentsVerified: 'is_documents_verified',
    verificationStatus: 'verification_status',
    verificationRejectionReason: 'verification_rejection_reason',
    reservationExpiresAt: 'reservation_expires_at',
  };

  async update(id, data, connection = null) {
    const dbConn = connection || db;
    // Build dynamic query with mapped fields
    const fields = [];
    const values = [];
    Object.keys(data).forEach((key) => {
      const column = LeaseModel.UPDATE_KEY_MAP[key];
      if (column && data[key] !== undefined) {
        fields.push(`${column} = ?`);
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

  async findAll(ownerId = null, treasurerId = null) {
    let query = `
             SELECT l.*, 
                    u.unit_number,
                    u.property_id,
                    p.name as property_name,
                    t_usr.name as tenant_name,
                    (SELECT (COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0)) 
                     FROM accounting_ledger 
                     WHERE lease_id = l.lease_id AND category IN ('deposit_held', 'deposit_withheld', 'deposit_refund')) as real_deposit_balance
             FROM leases l
             JOIN units u ON l.unit_id = u.unit_id
             JOIN properties p ON u.property_id = p.property_id
             JOIN users t_usr ON l.tenant_id = t_usr.user_id
             LEFT JOIN rent_invoices ri ON l.lease_id = ri.lease_id AND ri.invoice_type = 'deposit'`;
    const params = [];

    if (ownerId) {
      query += ` AND p.owner_id = ?`;
      params.push(ownerId);
    }
    
    if (treasurerId) {
      query += ` AND EXISTS (
        SELECT 1 FROM staff_property_assignments spa 
        WHERE spa.property_id = p.property_id AND spa.user_id = ?
      )`;
      params.push(treasurerId);
    }

    query += ` ORDER BY l.created_at DESC`;

    const [rows] = await db.query(query, params);
    return this.mapRows(rows);
  }

  async findById(id, connection = null) {
    const dbConn = connection || db;
    const [rows] = await dbConn.query(
      `
            SELECT l.*, 
                   u.unit_number,
                   u.property_id,
                   p.name as property_name,
                   t_usr.name as tenant_name,
                   (SELECT (COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0)) 
                    FROM accounting_ledger 
                    WHERE lease_id = l.lease_id AND category IN ('deposit_held', 'deposit_withheld', 'deposit_refund')) as real_deposit_balance
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            JOIN users t_usr ON l.tenant_id = t_usr.user_id
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
                   p.name as property_name,
                   t_usr.name as tenant_name,
                   (SELECT (COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0)) 
                    FROM accounting_ledger 
                    WHERE lease_id = l.lease_id AND category IN ('deposit_held', 'deposit_withheld', 'deposit_refund')) as real_deposit_balance
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            JOIN users t_usr ON l.tenant_id = t_usr.user_id
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
                   p.name as property_name,
                   t_usr.name as tenant_name,
                   (SELECT (COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0)) 
                    FROM accounting_ledger 
                    WHERE lease_id = l.lease_id AND category IN ('deposit_held', 'deposit_withheld', 'deposit_refund')) as real_deposit_balance
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            JOIN users t_usr ON l.tenant_id = t_usr.user_id
            WHERE l.status = 'active'
        `);
    return this.mapRows(rows);
  }

  async checkOverlap(unitId, startDate, endDate, excludeLeaseId = null, connection = null) {
    const dbConn = connection || db;
    let query = `
            SELECT lease_id FROM leases 
            WHERE unit_id = ? 
            AND status IN ('active', 'pending', 'draft')
           
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
      "UPDATE leases SET status = 'cancelled' WHERE lease_id = ?",
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
      `,
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
      `,
      [propertyId]
    );
    return rows[0].count;
  }

  async getDepositBalance(leaseId, connection = null) {
    const dbConn = connection || db;
    const [rows] = await dbConn.query(
      `SELECT (COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0)) as balance 
       FROM accounting_ledger 
       WHERE lease_id = ? AND category = 'deposit_held'`,
      [leaseId]
    );
    return Number(rows[0].balance || 0);
  }

  async getDepositStatus(leaseId, connection = null) {
    const dbConn = connection || db;
    const lease = await this.findById(leaseId, dbConn);
    if (!lease) return null;

    const paidAmount = await this.getDepositBalance(leaseId, dbConn);
    const targetAmount = lease.targetDeposit || 0;

    return {
      leaseId,
      targetAmount,
      paidAmount,
      isFullyPaid: paidAmount >= targetAmount,
      shortfall: Math.max(0, targetAmount - paidAmount)
    };
  }

  mapRows(rows) {
    return rows.map((row) => ({
      id: row.lease_id.toString(),
      tenantId: row.tenant_id.toString(),
      unitId: row.unit_id.toString(),
      startDate: this.formatDate(row.start_date),
      endDate: this.formatDate(row.end_date),
      monthlyRent: Number(row.monthly_rent),
      status: row.status,
      securityDeposit: Number(row.real_deposit_balance || 0),
      depositStatus: row.deposit_status,
      proposedRefundAmount: Number(row.proposed_refund_amount || 0),
      refundNotes: row.refund_notes,
      refundedAmount: Number(row.refunded_amount || 0),
      documentUrl: row.document_url,
      targetDeposit: Number(row.target_deposit || 0),
      signedAt: row.signed_at,
      isDocumentsVerified: !!row.is_documents_verified,
      verificationStatus: row.verification_status,
      verificationRejectionReason: row.verification_rejection_reason,
      reservationExpiresAt: row.reservation_expires_at,
      actualCheckoutAt: row.actual_checkout_at,
      createdAt: row.created_at,
      // Extra info useful for frontend listing
      unitNumber: row.unit_number,
      propertyId: row.property_id.toString(),
      propertyName: row.property_name,
      tenantName: row.tenant_name,
    }));
  }

  formatDate(date) {
    return formatToLocalDate(date);
  }

  // ============================================================================
  //  RENT ADJUSTMENTS (Addendums)
  // ============================================================================
  
  async getEffectiveRent(leaseId, date, connection = null) {
    const dbConn = connection || db;
    const [adjustments] = await dbConn.query(
      `SELECT new_monthly_rent FROM lease_rent_adjustments 
       WHERE lease_id = ? AND effective_date <= ? 
       ORDER BY effective_date DESC LIMIT 1`,
      [leaseId, date]
    );
    
    if (adjustments.length > 0) {
      return Number(adjustments[0].new_monthly_rent);
    }
    
    const [leases] = await dbConn.query(
      `SELECT monthly_rent FROM leases WHERE lease_id = ?`,
      [leaseId]
    );
    return leases.length > 0 ? Number(leases[0].monthly_rent) : 0;
  }

  async createAdjustment(data, connection = null) {
    const { leaseId, effectiveDate, newMonthlyRent, notes } = data;
    const dbConn = connection || db;
    const [result] = await dbConn.query(
      `INSERT INTO lease_rent_adjustments (lease_id, effective_date, new_monthly_rent, notes)
       VALUES (?, ?, ?, ?)`,
      [leaseId, effectiveDate, newMonthlyRent, notes]
    );
    return result.insertId;
  }

  async findAdjustmentsByLeaseId(leaseId) {
    const [rows] = await db.query(
      `SELECT * FROM lease_rent_adjustments WHERE lease_id = ? ORDER BY effective_date ASC`,
      [leaseId]
    );
    return rows.map(r => ({
      id: r.adjustment_id.toString(),
      leaseId: r.lease_id.toString(),
      effectiveDate: formatToLocalDate(r.effective_date),
      newMonthlyRent: Number(r.new_monthly_rent),
      notes: r.notes,
      createdAt: r.created_at
    }));
  }
}

export default new LeaseModel();
