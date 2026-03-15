import db from '../config/db.js';

class LeaseTermModel {
  async findAllByOwner(ownerId) {
    const [rows] = await db.query(`
            SELECT 
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
            ORDER BY name ASC
        `, [ownerId]);
    return rows;
  }

  async findById(id) {
    const [rows] = await db.query(`
            SELECT 
                lease_term_id as leaseTermId,
                owner_id as ownerId,
                name,
                type,
                duration_months as durationMonths,
                notice_period_months as noticePeriodMonths,
                is_default as isDefault,
                created_at as createdAt
            FROM lease_terms 
            WHERE lease_term_id = ?
        `, [id]);
    return rows[0];
  }

  async create(data) {
    const { ownerId, name, type, durationMonths, noticePeriodMonths, isDefault } = data;
    const [result] = await db.query(
      `INSERT INTO lease_terms (owner_id, name, type, duration_months, notice_period_months, is_default) VALUES (?, ?, ?, ?, ?, ?)`,
      [ownerId, name, type, durationMonths || null, noticePeriodMonths || 1, isDefault ? 1 : 0]
    );
    return result.insertId;
  }

  async update(id, data) {
    const { name, type, durationMonths, noticePeriodMonths, isDefault } = data;
    const [result] = await db.query(
      `UPDATE lease_terms SET name = ?, type = ?, duration_months = ?, notice_period_months = ?, is_default = ? WHERE lease_term_id = ?`,
      [name, type, durationMonths || null, noticePeriodMonths || 1, isDefault ? 1 : 0, id]
    );
    return result.affectedRows > 0;
  }

  async delete(id) {
    const [result] = await db.query(`DELETE FROM lease_terms WHERE lease_term_id = ?`, [id]);
    return result.affectedRows > 0;
  }

  async resetDefault(ownerId) {
      await db.query(`UPDATE lease_terms SET is_default = 0 WHERE owner_id = ?`, [ownerId]);
  }
}

export default new LeaseTermModel();
