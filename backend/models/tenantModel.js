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
      nic_url,
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
      nic_url,
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
      monthlyIncome: parseFloat(row.monthly_income),
      // dateOfBirth removed
      creditBalance: parseFloat(row.credit_balance || 0),
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

  // Whitelist of allowed fields: camelCase key -> snake_case column
  static ALLOWED_UPDATE_FIELDS = {
    nic: 'nic',
    nicUrl: 'nic_url',
    permanentAddress: 'permanent_address',
    emergencyContactName: 'emergency_contact_name',
    emergencyContactPhone: 'emergency_contact_phone',
    employmentStatus: 'employment_status',
    monthlyIncome: 'monthly_income',
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
    await db.query(
      'UPDATE tenants SET behavior_score = LEAST(100, GREATEST(0, behavior_score + ?)) WHERE user_id = ?',
      [scoreChange, userId]
    );
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
}

export default new TenantModel();
