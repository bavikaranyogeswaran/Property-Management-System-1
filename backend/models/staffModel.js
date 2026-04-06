// ============================================================================
//  STAFF MODEL (The Employee Records)
// ============================================================================
//  This file keeps track of people who work for the Owner (like Treasurers).
//  It stores their Employee ID, Job Title, and Work Hours.
// ============================================================================

import pool from '../config/db.js';

class StaffModel {
  async create(staffData, connection) {
    const { userId, nic, employeeId, jobTitle, shiftStart, shiftEnd } =
      staffData;

    // Uses the provided connection for transaction support
    const query = `
            INSERT INTO staff 
            (user_id, nic, employee_id, job_title, shift_start, shift_end) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;

    await connection.query(query, [
      userId,
      nic,
      employeeId,
      jobTitle,
      shiftStart,
      shiftEnd,
    ]);

    return userId;
  }

  async findByUserId(userId) {
    const [rows] = await pool.query('SELECT * FROM staff WHERE user_id = ?', [
      userId,
    ]);
    const row = rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      nic: row.nic,
      employeeId: row.employee_id,
      jobTitle: row.job_title,
      shiftStart: row.shift_start,
      shiftEnd: row.shift_end,
    };
  }

  //  ASSIGN PROPERTY: Giving a Treasurer responsibility for a specific building.
  //  Enforces exclusivity: A property can only have one treasurer.
  async assignProperty(userId, propertyId) {
    // Check if property is already assigned to ANY treasurer
    const [existing] = await pool.query(
      'SELECT user_id FROM staff_property_assignments WHERE property_id = ?',
      [propertyId]
    );

    if (existing.length > 0) {
      if (existing[0].user_id === userId) {
        throw new Error('This treasurer is already assigned to this property');
      }
      throw new Error('This property is already assigned to another treasurer');
    }

    const [result] = await pool.query(
      'INSERT INTO staff_property_assignments (user_id, property_id) VALUES (?, ?)',
      [userId, propertyId]
    );
    return result.insertId;
  }

  async removePropertyAssignment(userId, propertyId) {
    const [result] = await pool.query(
      'DELETE FROM staff_property_assignments WHERE user_id = ? AND property_id = ?',
      [userId, propertyId]
    );
    return result.affectedRows > 0;
  }

  async getAssignedProperties(userId) {
    const [rows] = await pool.query(
      `
            SELECT p.*, spa.assigned_at 
            FROM properties p
            JOIN staff_property_assignments spa ON p.property_id = spa.property_id
            WHERE spa.user_id = ?
        `,
      [userId]
    );

    return rows.map((row) => ({
      id: row.property_id.toString(),
      ownerId: row.owner_id ? row.owner_id.toString() : null,
      name: row.name,
      propertyNo: row.property_no,
      street: row.street,
      city: row.city,
      district: row.district,
      status: row.status,
      assignedAt: row.assigned_at,
    }));
  }

  /**
   * [HIGH-PERFORMANCE] Point-check for staff assignment.
   * Replaces fetching of the entire portfolio with a single row 'EXISTS' check.
   */
  async isAssignedToProperty(userId, propertyId) {
    const [rows] = await pool.query(
      'SELECT 1 FROM staff_property_assignments WHERE user_id = ? AND property_id = ? LIMIT 1',
      [userId, propertyId]
    );
    return rows.length > 0;
  }
}

export default new StaffModel();
