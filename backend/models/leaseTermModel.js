// ============================================================================
//  LEASE TERM MODEL (The Duration Configurator)
// ============================================================================
//  Stores the allowable lease lengths (e.g. 6 Months, 1 Year).
// ============================================================================

import db from '../config/db.js';

class LeaseTermModel {
  // FIND ALL BY OWNER: Lists the allowable contract types for a specific landlord's portfolio.
  async findAllByOwner(ownerId) {
    // 1. [QUERY] Extraction: Selecting with aliasing for DTO/camelCase consistency
    const [rows] = await db.query(
      `SELECT 
                lease_term_id as id,
                lease_term_id as leaseTermId,
                owner_id as ownerId,
                name,
                type,
                duration_months as durationMonths,
                notice_period_months as noticePeriodMonths,
                is_default as isDefault,
                created_at as createdAt
            FROM lease_terms 
            WHERE owner_id = ?
            ORDER BY name ASC`,
      [ownerId]
    );
    return rows;
  }

  // FIND BY ID: Fetches the specific duration configuration by its key.
  async findById(id, connection = null) {
    const dbConn = connection || db;
    // 1. [QUERY] Construction
    const [rows] = await dbConn.query(
      `SELECT 
                lease_term_id as id,
                lease_term_id as leaseTermId,
                owner_id as ownerId,
                name,
                type,
                duration_months as durationMonths,
                notice_period_months as noticePeriodMonths,
                is_default as isDefault,
                created_at as createdAt
            FROM lease_terms 
            WHERE lease_term_id = ?`,
      [id]
    );
    return rows[0];
  }

  // CREATE: Defines a new lease duration template.
  async create(data) {
    const {
      ownerId,
      name,
      type,
      durationMonths,
      noticePeriodMonths,
      isDefault,
    } = data;
    // 1. [DATA] Persistence
    const [result] = await db.query(
      `INSERT INTO lease_terms (owner_id, name, type, duration_months, notice_period_months, is_default) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        ownerId,
        name,
        type,
        durationMonths || null,
        noticePeriodMonths || 1,
        isDefault ? 1 : 0,
      ]
    );
    return result.insertId;
  }

  // UPDATE: Modifies existing term configurations (duration, notice periods).
  async update(id, data) {
    const { name, type, durationMonths, noticePeriodMonths, isDefault } = data;
    // 1. [DATA] State Persistence
    const [result] = await db.query(
      `UPDATE lease_terms SET name = ?, type = ?, duration_months = ?, notice_period_months = ?, is_default = ? WHERE lease_term_id = ?`,
      [
        name,
        type,
        durationMonths || null,
        noticePeriodMonths || 1,
        isDefault ? 1 : 0,
        id,
      ]
    );
    return result.affectedRows > 0;
  }

  // DELETE: Removes a config template (permanent purge).
  async delete(id) {
    // 1. [DATA] Cleanup
    const [result] = await db.query(
      `DELETE FROM lease_terms WHERE lease_term_id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }

  // RESET DEFAULT: Clears the 'is_default' flag across all of an owner's templates before setting a new one.
  async resetDefault(ownerId) {
    // 1. [DATA] Bulk Reset
    await db.query(`UPDATE lease_terms SET is_default = 0 WHERE owner_id = ?`, [
      ownerId,
    ]);
  }
}

export default new LeaseTermModel();
