// ============================================================================
//  TENANT MODEL (The Renter's Profile)
// ============================================================================
//  This file stores extra details about the people living in the units.
//  Things like Emergency Contacts, Employment Status, and Monthly Income.
// ============================================================================

import pool from '../config/db.js';

class TenantModel {
  //  CREATE PROFILE: Saving the detailed info for a new tenant.
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

    // Uses the provided connection for transaction support
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

  async findByUserId(userId, connection = null) {
    // Use provided connection or default pool
    const db = connection || pool;
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
      // employerName removed
      employmentStatus: row.employment_status,
      monthlyIncome: Number(row.monthly_income),
      // dateOfBirth removed
      creditBalance: Number(row.credit_balance || 0),
      behaviorScore: row.behavior_score,
    };
  }

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

    const query = `
      UPDATE tenants 
      SET nic = ?, 
          nic_url = ?, 
          permanent_address = ?, 
          emergency_contact_name = ?, 
          emergency_contact_phone = ?, 
          monthly_income = ?
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

  // Whitelist of allowed fields for general updates (E7)
  // NIC and Monthly Income are EXCLUDED here as they should not change after onboarding.
  static ALLOWED_UPDATE_FIELDS = {
    permanentAddress: 'permanent_address',
    emergencyContactName: 'emergency_contact_name',
    emergencyContactPhone: 'emergency_contact_phone',
    employmentStatus: 'employment_status',
  };

  async update(userId, data, connection = null) {
    const db = connection || pool;
    const fields = [];
    const values = [];

    Object.keys(data).forEach((key) => {
      const column = TenantModel.ALLOWED_UPDATE_FIELDS[key];
      if (column && data[key] !== undefined) {
        fields.push(`${column} = ?`);
        values.push(data[key]);
      }
    });

    if (fields.length === 0) return false;

    values.push(userId);
    const [result] = await db.query(
      `UPDATE tenants SET ${fields.join(', ')} WHERE user_id = ?`,
      values
    );
    return result.affectedRows > 0;
  }

  async addCredit(userId, amount, connection = null) {
    const db = connection || pool;
    await db.query(
      'UPDATE tenants SET credit_balance = credit_balance + ? WHERE user_id = ?',
      [amount, userId]
    );
  }

  async deductCredit(userId, amount, connection = null) {
    const db = connection || pool;
    await db.query(
      'UPDATE tenants SET credit_balance = credit_balance - ? WHERE user_id = ?',
      [amount, userId]
    );
  }
  async incrementBehaviorScore(userId, scoreChange, connection = null) {
    const db = connection || pool;
    const currentScore = await this.getBehaviorScore(userId, db);
    if (currentScore === null) return null;

    const newScore = Math.min(100, Math.max(0, currentScore + scoreChange));

    await db.query('UPDATE tenants SET behavior_score = ? WHERE user_id = ?', [
      newScore,
      userId,
    ]);
    return newScore;
  }

  async getBehaviorScore(userId, connection = null) {
    const db = connection || pool;
    const [rows] = await db.query(
      'SELECT behavior_score FROM tenants WHERE user_id = ?',
      [userId]
    );
    if (rows.length === 0) return null;
    return rows[0].behavior_score;
  }

  /**
   * Recalculates and synchronizes the behavior score from logs (C2 fix).
   * Prevents score drift from failed increments.
   */
  async recalculateBehaviorScore(userId, connection = null) {
    const db = connection || pool;
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

  /**
   * Recalculates and synchronizes the behavior score for ALL active tenants.
   * Runs nightly to prevent any possibility of long-term score drift.
   */
  async recalculateAllBehaviorScores(connection = null) {
    const db = connection || pool;
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

  /**
   * Reconciliation for credit balance (C2 fix).
   * Ensures cached balance matches verified overpayments minus usage.
   * This is a placeholder for future complex ledger-based reconciliation.
   */
  async recalculateCreditBalance(userId, connection = null) {
    const db = connection || pool;

    // Calculate Total Overpayments directly from invoices vs cash payments
    const [[{ total_additions }]] = await db.query(
      `
      SELECT COALESCE(SUM(GREATEST(0, cash_paid - invoice_amount)), 0) as total_additions
      FROM (
        SELECT 
          ri.invoice_id, 
          ri.amount as invoice_amount,
          COALESCE(SUM(p.amount), 0) as cash_paid
        FROM rent_invoices ri
        JOIN leases l ON ri.lease_id = l.lease_id
        LEFT JOIN payments p ON p.invoice_id = ri.invoice_id AND p.status = 'verified' AND p.payment_method != 'credit'
        WHERE l.tenant_id = ?
        GROUP BY ri.invoice_id, ri.amount
      ) base
    `,
      [userId]
    );

    // Calculate Total Credits Used
    const [[{ total_deductions }]] = await db.query(
      `
      SELECT COALESCE(SUM(p.amount), 0) as total_deductions
      FROM payments p
      JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
      JOIN leases l ON ri.lease_id = l.lease_id
      WHERE p.payment_method = 'credit' AND p.status = 'verified' AND l.tenant_id = ?
    `,
      [userId]
    );

    const actualBalance = Number(total_additions) - Number(total_deductions);
    const safeBalance = Math.max(0, actualBalance); // Prevent negative credits

    const [rows] = await db.query(
      'UPDATE tenants SET credit_balance = ? WHERE user_id = ?',
      [safeBalance, userId]
    );
    return rows.affectedRows > 0;
  }

  /**
   * Recalculates credit balances for all tenants.
   */
  async recalculateAllCreditBalances(connection = null) {
    const db = connection || pool;
    // For mass recalculation, we update everyone via a derived table
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
