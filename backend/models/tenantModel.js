// ============================================================================
//  TENANT MODEL (The Renter's Profile)
// ============================================================================
//  This file stores extra details about the people living in the units.
//  Things like Emergency Contacts, Employment Status, and Monthly Income.
// ============================================================================

import pool from '../config/db.js';

class TenantModel {
  //  CREATE PROFILE: Saving the detailed info for a new tenant.
  // CREATE PROFILE: Records descriptive metadata for a person entering the system as a tenant.
  async create(tenantData, connection) {
    const {
      userId,
      nic,
      nicUrl,
      permanentAddress,
      emergencyContactName,
      emergencyContactPhone,
      employmentStatus,
      monthlyIncome,
    } = tenantData;

    // 1. [DATA] Persistence: Extends core User profile with residential and financial metadata
    const query = `
            INSERT INTO tenants (user_id, nic, nic_url, permanent_address, emergency_contact_name, emergency_contact_phone, 
             employment_status, monthly_income) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

    await connection.query(query, [
      userId,
      nic,
      nicUrl,
      permanentAddress,
      emergencyContactName,
      emergencyContactPhone,
      employmentStatus,
      monthlyIncome,
    ]);

    return userId;
  }

  // FIND BY USER ID: Resolves the complete residential profile for a tenant.
  async findByUserId(userId, connection = null) {
    const db = connection || pool;
    // 1. [QUERY] Extraction
    const [rows] = await db.query('SELECT * FROM tenants WHERE user_id = ?', [
      userId,
    ]);
    const row = rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      nic: row.nic,
      nicUrl: row.nic_url,
      permanentAddress: row.permanent_address,
      emergencyContactName: row.emergency_contact_name,
      emergencyContactPhone: row.emergency_contact_phone,
      employmentStatus: row.employment_status,
      monthlyIncome: Number(row.monthly_income),
      creditBalance: Number(row.credit_balance || 0),
      behaviorScore: row.behavior_score,
    };
  }

  // UPDATE PROFILE: Modifies core residential details, ensuring data integrity across sessions.
  async updateProfile(userId, tenantData, connection = null) {
    const db = connection || pool;
    const {
      nic,
      nicUrl,
      permanentAddress,
      emergencyContactName,
      emergencyContactPhone,
      monthlyIncome,
    } = tenantData;

    // 1. [DATA] Persistence: Batch update of profile fields
    const query = `
      UPDATE tenants 
      SET nic = ?, nic_url = ?, permanent_address = ?, emergency_contact_name = ?, emergency_contact_phone = ?, monthly_income = ?
      WHERE user_id = ?
    `;

    await db.query(query, [
      nic || null,
      nicUrl || null,
      permanentAddress || null,
      emergencyContactName || null,
      emergencyContactPhone || null,
      monthlyIncome || 0,
      userId,
    ]);
  }

  // ALLOWED UPDATE FIELDS: Whitelist to prevent over-posting and illegal modifications of financial history.
  static ALLOWED_UPDATE_FIELDS = {
    permanentAddress: 'permanent_address',
    emergencyContactName: 'emergency_contact_name',
    emergencyContactPhone: 'emergency_contact_phone',
    employmentStatus: 'employment_status',
  };

  // UPDATE: Dynamic field update for non-critical residential metadata.
  async update(userId, data, connection = null) {
    const db = connection || pool;
    const fields = [];
    const values = [];

    // 1. [TRANSFORMATION] Whitelist Application: Filter input keys against allowed schema
    Object.keys(data).forEach((key) => {
      const column = TenantModel.ALLOWED_UPDATE_FIELDS[key];
      if (column && data[key] !== undefined) {
        fields.push(`${column} = ?`);
        values.push(data[key]);
      }
    });

    if (fields.length === 0) return false;

    values.push(userId);
    // 2. [DATA] Selective Persistence
    const [result] = await db.query(
      `UPDATE tenants SET ${fields.join(', ')} WHERE user_id = ?`,
      values
    );
    return result.affectedRows > 0;
  }

  // ADD CREDIT: Injects capital into the tenant's virtual wallet and logs the audit trail.
  async addCredit(
    userId,
    amount,
    connection = null,
    reason = 'manual_adjustment',
    referenceId = null
  ) {
    const db = connection || pool;
    // 1. [DATA] Balance Adjustment: Increment the cached credit pool
    await db.query(
      'UPDATE tenants SET credit_balance = credit_balance + ? WHERE user_id = ?',
      [amount, userId]
    );
    // 2. [AUDIT] Log Persistence: Append entry to the credit ledger for historical transparency
    await db.query(
      'INSERT INTO tenant_credit_logs (tenant_id, amount_change, reason, reference_id) VALUES (?, ?, ?, ?)',
      [userId, amount, reason, referenceId]
    );
  }

  // DEDUCT CREDIT: Removes capital from the tenant's wallet (e.g., when applied to an invoice).
  async deductCredit(
    userId,
    amount,
    connection = null,
    reason = 'manual_adjustment',
    referenceId = null
  ) {
    const db = connection || pool;
    // 1. [DATA] Balance Adjustment: Decrement the cached credit pool
    await db.query(
      'UPDATE tenants SET credit_balance = credit_balance - ? WHERE user_id = ?',
      [amount, userId]
    );
    // 2. [AUDIT] Log Persistence: Append negative entry to the credit ledger
    await db.query(
      'INSERT INTO tenant_credit_logs (tenant_id, amount_change, reason, reference_id) VALUES (?, ?, ?, ?)',
      [userId, -amount, reason, referenceId]
    );
  }

  // INCREMENT BEHAVIOR SCORE: Atomically adjusts the reputation score of a tenant based on events.
  async incrementBehaviorScore(userId, scoreChange, connection = null) {
    const db = connection || pool;
    // 1. [DATA] Atomic Clamped Update: DB-native operation prevents race conditions [0 <= Score <= 100]
    const [result] = await db.query(
      `UPDATE tenants
       SET behavior_score = LEAST(100, GREATEST(0, behavior_score + ?))
       WHERE user_id = ?`,
      [scoreChange, userId]
    );
    if (result.affectedRows === 0) return null;
    // 2. [QUERY] Fresh Read: Returns the final computed value to the caller
    const newScore = await this.getBehaviorScore(userId, db);
    return newScore;
  }

  // GET BEHAVIOR SCORE: Quick lookup for the reputation metric.
  async getBehaviorScore(userId, connection = null) {
    const db = connection || pool;
    // 1. [QUERY] Point Retrieval
    const [rows] = await db.query(
      'SELECT behavior_score FROM tenants WHERE user_id = ?',
      [userId]
    );
    if (rows.length === 0) return null;
    return rows[0].behavior_score;
  }

  // RECALCULATE BEHAVIOR SCORE: Reconciliation of total reputation points from the log history.
  async recalculateBehaviorScore(userId, connection = null) {
    const db = connection || pool;
    // 1. [DATA] Reconciliation: Resolves total sum of logs into the single source-of-truth field
    const [rows] = await db.query(
      `UPDATE tenants SET behavior_score = (
        SELECT LEAST(100, GREATEST(0, 100 + COALESCE(SUM(score_change), 0)))
        FROM tenant_behavior_logs
        WHERE tenant_id = ?
      ) WHERE user_id = ?`,
      [userId, userId]
    );
    return rows.affectedRows > 0;
  }

  // RECALCULATE ALL BEHAVIOR SCORES: Batch recovery of behavior metrics (Nightly synchronization).
  async recalculateAllBehaviorScores(connection = null) {
    const db = connection || pool;
    // 1. [DATA] Bulk Reconciliation: Syncs everyone's score to prevent long-term software state drift
    const [rows] = await db.query(`
      UPDATE tenants t
      SET behavior_score = (
        SELECT LEAST(100, GREATEST(0, 100 + COALESCE(SUM(score_change), 0)))
        FROM tenant_behavior_logs
        WHERE tenant_id = t.user_id
      )
    `);
    return rows.affectedRows;
  }

  // RECALCULATE CREDIT BALANCE: Heavy-weight audit of the financial ledger vs the cached balance.
  async recalculateCreditBalance(userId, connection = null) {
    const db = connection || pool;

    // 1. [AUDIT] Revenue Aggregation: Sum of overpayments (Cash paid > Invoice amount)
    const [[{ total_additions }]] = await db.query(
      `SELECT COALESCE(SUM(GREATEST(0, cash_paid - invoice_amount)), 0) as total_additions
      FROM (
        SELECT ri.invoice_id, ri.amount as invoice_amount, COALESCE(SUM(p.amount), 0) as cash_paid
        FROM rent_invoices ri
        JOIN leases l ON ri.lease_id = l.lease_id
        LEFT JOIN payments p ON p.invoice_id = ri.invoice_id AND p.status = 'verified' AND p.payment_method != 'credit'
        WHERE l.tenant_id = ?
        GROUP BY ri.invoice_id, ri.amount
      ) base`,
      [userId]
    );

    // 2. [AUDIT] Usage Aggregation: Sum of all payments settled via credit-system
    const [[{ total_deductions }]] = await db.query(
      `SELECT COALESCE(SUM(p.amount), 0) as total_deductions
      FROM payments p
      JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
      JOIN leases l ON ri.lease_id = l.lease_id
      WHERE p.payment_method = 'credit' AND p.status = 'verified' AND l.tenant_id = ?`,
      [userId]
    );

    // 3. [DATA] Reconciliation Persistence: Resolves the discrepancy directly into the tenant profile
    const actualBalance = Number(total_additions) - Number(total_deductions);
    const safeBalance = Math.max(0, actualBalance);

    const [rows] = await db.query(
      'UPDATE tenants SET credit_balance = ? WHERE user_id = ?',
      [safeBalance, userId]
    );
    return rows.affectedRows > 0;
  }

  // RECALCULATE ALL CREDIT BALANCES: Global financial recovery task.
  async recalculateAllCreditBalances(connection = null) {
    const db = connection || pool;
    // 1. [DATA] Massive Reconciliation: Rebuilds every tenant's balance from individual payment atoms
    const [rows] = await db.query(`
      UPDATE tenants t
      LEFT JOIN (
        SELECT 
          tenant_id,
          GREATEST(0, COALESCE(SUM(GREATEST(0, cash_paid - invoice_amount)), 0) - COALESCE(MAX(total_deductions), 0)) as safe_balance
        FROM (
          SELECT 
            l.tenant_id,
            ri.invoice_id, 
            ri.amount as invoice_amount,
            COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = ri.invoice_id AND status = 'verified' AND payment_method != 'credit'), 0) as cash_paid,
            COALESCE((
              SELECT SUM(p2.amount) 
              FROM payments p2 
              JOIN rent_invoices ri2 ON p2.invoice_id = ri2.invoice_id
              JOIN leases l2 ON ri2.lease_id = l2.lease_id
              WHERE p2.payment_method = 'credit' AND p2.status = 'verified' AND l2.tenant_id = l.tenant_id
            ), 0) as total_deductions
          FROM rent_invoices ri
          JOIN leases l ON ri.lease_id = l.lease_id
        ) base
        GROUP BY tenant_id
      ) calc ON t.user_id = calc.tenant_id
      SET t.credit_balance = COALESCE(calc.safe_balance, 0)
    `);
    return rows.affectedRows;
  }
}

export default new TenantModel();
