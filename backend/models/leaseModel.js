// ============================================================================
//  LEASE MODEL (The Contract Cabinet)
// ============================================================================
//  This file holds all the signed rental agreements.
//  It knows who lives where, for how long, and how much they pay.
// ============================================================================

import db from '../config/db.js';
import { getCurrentDateString, formatToLocalDate } from '../utils/dateUtils.js';

/**
 * [ARCHITECTURAL SEMANTICS]
 * leases.monthly_rent strictly represents the legally binding CONTRACTUAL RENT
 * agreed upon by the tenant and owner.
 *
 * This is the ONLY value that should ever be used for automated invoicing,
 * late fee calculations, or financial forecasting tied to active tenants.
 * It is fully decoupled from the baseline listing price (`units.monthly_rent`).
 */
class LeaseModel {
  // CREATE LEASE: Filing a new contract.
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
      leaseTermId,
      reservationExpiresInDays,
    } = data;
    const dbConn = connection || db;

    // 1. [TRANSFORMATION] Expiry Logic: Use SQL-native timestamp math for reservations
    let expiryExpr = '?';
    let expiryValue = data.reservationExpiresAt || null;

    if (reservationExpiresInDays) {
      expiryExpr = `DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY)`;
      expiryValue = reservationExpiresInDays;
    }

    // 2. [DATA] Persistence: Insert the contractual agreement into the ledger
    const [result] = await dbConn.query(
      `INSERT INTO leases (tenant_id, unit_id, lease_term_id, start_date, end_date, monthly_rent, status, deposit_status, document_url, target_deposit, reservation_expires_at, escalation_percentage, escalation_period_months, last_escalation_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${expiryExpr}, ?, ?, ?)`,
      [
        tenantId,
        unitId,
        leaseTermId || null,
        startDate,
        endDate,
        monthlyRent,
        status || 'active',
        depositStatus || 'pending',
        data.documentUrl || null,
        data.targetDeposit || 0.0,
        expiryValue,
        data.escalationPercentage || null,
        data.escalationPeriodMonths || 12,
        data.lastEscalationDate || null,
      ]
    );
    return result.insertId;
  }

  // UPDATE: Modifies contract terms, status, or refund calculations.
  async update(id, data, connection = null) {
    const dbConn = connection || db;
    const fields = [];
    const values = [];

    // 1. [TRANSFORMATION] Dynamic Mapping: Convert camelCase keys to snake_case db columns
    Object.keys(data).forEach((key) => {
      const column = LeaseModel.UPDATE_KEY_MAP[key];
      if (column && data[key] !== undefined) {
        if (
          key === 'reservationExpiresAt' &&
          typeof data[key] === 'object' &&
          data[key].sql
        ) {
          fields.push(`${column} = ${data[key].sql}`);
        } else {
          fields.push(`${column} = ?`);
          values.push(data[key]);
        }
      }
    });

    if (fields.length === 0) return false;

    values.push(id);
    // 2. [DATA] State Persistence
    const [result] = await dbConn.query(
      `UPDATE leases SET ${fields.join(', ')} WHERE lease_id = ?`,
      values
    );
    return result.affectedRows > 0;
  }

  // GET BASE QUERY: Centralized definition of the "Rich Lease Object" with real-time financial balances.
  _getBaseQuery() {
    // 1. [QUERY] Aggregate Join: Merges lease data with unit details and ledger-derived deposit balances
    return `
      SELECT l.*, 
             u.unit_number,
             u.property_id,
             p.name as property_name,
             t_usr.name as tenant_name,
             COALESCE(dep_bal.deposit_balance, 0) AS real_deposit_balance
      FROM leases l
      JOIN units u ON l.unit_id = u.unit_id
      JOIN properties p ON u.property_id = p.property_id
      JOIN users t_usr ON l.tenant_id = t_usr.user_id
      LEFT JOIN (
        SELECT lease_id,
               COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0) AS deposit_balance
        FROM accounting_ledger
        WHERE category IN ('deposit_held', 'deposit_withheld', 'deposit_refund')
        GROUP BY lease_id
      ) dep_bal ON dep_bal.lease_id = l.lease_id
    `;
  }

  // FIND ALL: Lists active/historical leases, filtered by role-based property visibility.
  async findAll(ownerId = null, treasurerId = null) {
    let query = `${this._getBaseQuery()} WHERE 1=1 `;
    const params = [];

    // 1. [QUERY] RBAC Filtering
    if (ownerId) {
      query += ` AND p.owner_id = ?`;
      params.push(ownerId);
    }
    if (treasurerId) {
      query += ` AND EXISTS (SELECT 1 FROM staff_property_assignments spa 
                 WHERE spa.property_id = p.property_id AND spa.user_id = ?)`;
      params.push(treasurerId);
    }

    query += ` ORDER BY l.created_at DESC`;

    const [rows] = await db.query(query, params);
    return this.mapRows(rows);
  }

  // FIND BY ID: Fetches a single contract with all joined property/financial context.
  async findById(id, connection = null) {
    const dbConn = connection || db;
    // 1. [QUERY] Direct Retrieval
    const [rows] = await dbConn.query(
      `${this._getBaseQuery()} WHERE l.lease_id = ?`,
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapRows(rows)[0];
  }

  // FIND BY ID FOR UPDATE: Atomic retrieval with row-level locking for status transitions.
  async findByIdForUpdate(id, connection) {
    if (!connection)
      throw new Error(
        'findByIdForUpdate requires an active transaction connection.'
      );

    // 1. [QUERY] Locked Retrieval: Prevents concurrent checkout or termination race conditions
    const [rows] = await connection.query(
      `${this._getBaseQuery()} WHERE l.lease_id = ? FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapRows(rows)[0];
  }

  // FIND BY TENANT ID: Lists the current and historical housing records for a user.
  async findByTenantId(tenantId) {
    const [rows] = await db.query(
      `${this._getBaseQuery()} WHERE l.tenant_id = ?`,
      [tenantId]
    );
    return this.mapRows(rows);
  }

  // FIND BY UNIT ID: Lists all contracts associated with a specific apartment.
  async findByUnitId(unitId, connection = null) {
    const dbConn = connection || db;
    const [rows] = await dbConn.query(
      `${this._getBaseQuery()} WHERE l.unit_id = ? ORDER BY l.start_date DESC`,
      [unitId]
    );
    return this.mapRows(rows);
  }

  // FIND ACTIVE: Registry of all currently binding agreements.
  async findActive() {
    const [rows] = await db.query(
      `${this._getBaseQuery()} WHERE l.status = 'active'`
    );
    return this.mapRows(rows);
  }

  // CHECK OVERLAP: Date-collision guard to ensure no two occupants are booked for the same unit-date.
  async checkOverlap(
    unitId,
    startDate,
    endDate,
    excludeLeaseId = null,
    connection = null
  ) {
    const dbConn = connection || db;
    // 1. [QUERY] Conflict Detection: Detects intersection of date ranges for non-terminal leases
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

    query += ` FOR UPDATE`;

    const [rows] = await dbConn.query(query, params);
    return rows.length > 0;
  }

  // DELETE: Soft-deletion by marking the contract as 'cancelled'.
  async delete(id, connection = null) {
    const dbConn = connection || db;
    const [result] = await dbConn.query(
      "UPDATE leases SET status = 'cancelled' WHERE lease_id = ?",
      [id]
    );
    return result.affectedRows > 0;
  }

  // COUNT ACTIVE BY UNIT: High-level occupancy check.
  async countActiveByUnitId(unitId, connection = null) {
    const dbConn = connection || db;
    const [rows] = await dbConn.query(
      `SELECT COUNT(*) as count FROM leases WHERE unit_id = ? AND status IN ('active', 'pending', 'draft')`,
      [unitId]
    );
    return rows[0].count;
  }

  // COUNT ACTIVE BY PROPERTY: Aggregates portfolio occupancy for Owner dash statistics.
  async countActiveByPropertyId(propertyId, connection = null) {
    const dbConn = connection || db;
    const [rows] = await dbConn.query(
      `SELECT COUNT(*) as count FROM leases l
       JOIN units u ON l.unit_id = u.unit_id
       WHERE u.property_id = ? AND l.status IN ('active', 'pending', 'draft')`,
      [propertyId]
    );
    return rows[0].count;
  }

  // GET DEPOSIT BALANCE: Calculates the net liquidity held as security for this contract.
  async getDepositBalance(leaseId, connection = null) {
    const dbConn = connection || db;
    // 1. [QUERY] Aggregated Calculation: credit (payments) - debit (forfeits/refunds)
    const [rows] = await dbConn.query(
      `SELECT (COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0)) as balance 
       FROM accounting_ledger 
       WHERE lease_id = ? AND category = 'deposit_held'`,
      [leaseId]
    );
    return Number(rows[0].balance || 0);
  }

  // GET DEPOSIT STATUS: Summary of fulfillment against the contractually required security amount.
  async getDepositStatus(leaseId, connection = null) {
    const dbConn = connection || db;
    // 1. [ORCHESTRATION] Data Comparison
    const lease = await this.findById(leaseId, dbConn);
    if (!lease) return null;

    const paidAmount = await this.getDepositBalance(leaseId, dbConn);
    const targetAmount = lease.targetDeposit || 0;

    return {
      leaseId,
      targetAmount,
      paidAmount,
      isFullyPaid: paidAmount >= targetAmount,
      shortfall: Math.max(0, targetAmount - paidAmount),
    };
  }

  // MAP ROWS: Serializes database rows into a standardized camelCase DTO.
  mapRows(rows) {
    return rows.map((row) => ({
      id: row.lease_id.toString(),
      tenantId: row.tenant_id.toString(),
      unitId: row.unit_id.toString(),
      startDate: this.formatDate(row.start_date),
      endDate: this.formatDate(row.end_date),
      monthlyRent: Number(row.monthly_rent),
      status: row.status,
      currentDepositBalance: Number(row.real_deposit_balance || 0),
      depositStatus: row.deposit_status,
      proposedRefundAmount: Number(row.proposed_refund_amount || 0),
      refundNotes: row.refund_notes,
      refundedAmount: Number(row.refunded_amount || 0),
      documentUrl: row.document_url,
      targetDeposit: Number(row.target_deposit || 0),
      signedAt: row.signed_at,
      isDocumentsVerified: row.verification_status === 'verified',
      verificationStatus: row.verification_status,
      verificationRejectionReason: row.verification_rejection_reason,
      reservationExpiresAt: row.reservation_expires_at,
      actualCheckoutAt: row.actual_checkout_at,
      leaseTermId: row.lease_term_id ? row.lease_term_id.toString() : null,
      createdAt: row.created_at,
      unitNumber: row.unit_number,
      propertyId: row.property_id.toString(),
      propertyName: row.property_name,
      tenantName: row.tenant_name,
    }));
  }

  // FORMAT DATE: Safe date utility conversion.
  formatDate(date) {
    return formatToLocalDate(date);
  }

  // GET EFFECTIVE RENT: Resolves current rent price after factoring in historical addendums.
  async getEffectiveRent(leaseId, date, connection = null) {
    const dbConn = connection || db;
    // 1. [QUERY] Adjustment Lookup: Prioritize the most recent adjustment that was active on the target date
    const [adjustments] = await dbConn.query(
      `SELECT new_monthly_rent FROM lease_rent_adjustments 
       WHERE lease_id = ? AND effective_date <= ? 
       ORDER BY effective_date DESC LIMIT 1`,
      [leaseId, date]
    );

    if (adjustments.length > 0) return Number(adjustments[0].new_monthly_rent);

    // 2. [DATA] Fallback: Use the base rent from the original contract
    const [leases] = await dbConn.query(
      `SELECT monthly_rent FROM leases WHERE lease_id = ?`,
      [leaseId]
    );
    return leases.length > 0 ? Number(leases[0].monthly_rent) : 0;
  }

  // CREATE ADJUSTMENT: Files a rent change addendum (e.g. increase).
  async createAdjustment(data, connection = null) {
    const { leaseId, effectiveDate, newMonthlyRent, notes } = data;
    const dbConn = connection || db;
    try {
      // 1. [DATA] Persistence
      const [result] = await dbConn.query(
        `INSERT INTO lease_rent_adjustments (lease_id, effective_date, new_monthly_rent, notes)
         VALUES (?, ?, ?, ?)`,
        [leaseId, effectiveDate, newMonthlyRent, notes]
      );
      return result.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        const error = new Error(
          `A rent adjustment for this lease already exists on ${effectiveDate}. Please edit the existing adjustment instead.`
        );
        error.statusCode = 400;
        throw error;
      }
      throw err;
    }
  }

  // FIND ADJUSTMENTS BY LEASE: Lists historical price changes for a contract.
  async findAdjustmentsByLeaseId(leaseId) {
    const [rows] = await db.query(
      `SELECT * FROM lease_rent_adjustments WHERE lease_id = ? ORDER BY effective_date ASC`,
      [leaseId]
    );
    return rows.map((r) => ({
      id: r.adjustment_id.toString(),
      leaseId: r.lease_id.toString(),
      effectiveDate: formatToLocalDate(r.effective_date),
      newMonthlyRent: Number(r.new_monthly_rent),
      notes: r.notes,
      createdAt: r.created_at,
    }));
  }

  // FIND LEASES NEEDING ESCALATION: Identifies contracts due for automated rent increases.
  async findLeasesNeedingEscalation(targetDateString) {
    // 1. [QUERY] Filtered Aggregation: Detects leases where interval has passed since start or last escalation
    const [rows] = await db.query(
      `SELECT l.*, p.name as property_name, u.unit_number
       FROM leases l
       JOIN units u ON l.unit_id = u.unit_id
       JOIN properties p ON u.property_id = p.property_id
       WHERE l.status = 'active'
         AND l.escalation_percentage IS NOT NULL
         AND l.escalation_percentage > 0
         AND (
           (l.last_escalation_date IS NULL AND DATE_ADD(l.start_date, INTERVAL l.escalation_period_months MONTH) <= ?)
           OR
           (l.last_escalation_date IS NOT NULL AND DATE_ADD(l.last_escalation_date, INTERVAL l.escalation_period_months MONTH) <= ?)
         )`,
      [targetDateString, targetDateString]
    );
    return rows;
  }

  // GET ADJUSTMENTS: Low-level retrieval for specific contract pricing context.
  async getAdjustments(leaseId, connection = null) {
    const dbConn = connection || db;
    // 1. [DATA] Resolution
    const [rows] = await dbConn.query(
      'SELECT * FROM lease_rent_adjustments WHERE lease_id = ? ORDER BY effective_date ASC',
      [leaseId]
    );
    return rows;
  }
}

export default new LeaseModel();
