// ============================================================================
//  STAFF MODEL (The Employee Records)
// ============================================================================
//  This file keeps track of people who work for the Owner (like Treasurers).
//  It stores their Employee ID, Job Title, and Work Hours.
// ============================================================================

import pool from '../config/db.js';

class StaffModel {
  // CREATE: Records professional and scheduling metadata for a staff member.
  async create(staffData, connection) {
    const { userId, nic, employeeId, jobTitle, shiftStart, shiftEnd } =
      staffData;

    // 1. [DATA] Persistence: Extends the core 'User' profile with employment-specific fields
    const query = `
            INSERT INTO staff 
            (user_id, nic, employee_id, job_title, shift_start, shift_end) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;

    try {
      await connection.query(query, [
        userId,
        nic,
        employeeId,
        jobTitle,
        shiftStart,
        shiftEnd,
      ]);
    } catch (err) {
      // 2. [SECURITY] Duplicate Guard: Enforce identity uniqueness via NIC
      if (
        err.code === 'ER_DUP_ENTRY' &&
        err.message.includes('unique_staff_nic')
      ) {
        const error = new Error('A staff member with this NIC already exists.');
        error.status = 400;
        throw error;
      }
      throw err;
    }

    return userId;
  }

  // FIND BY USER ID: Resolves the employment profile for a specific staff user.
  async findByUserId(userId) {
    // 1. [QUERY] Extraction
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

  // ASSIGN PROPERTY: Links a treasurer to a building they are responsible for managing.
  async assignProperty(userId, propertyId) {
    // 1. [SECURITY] Sanity Check: Prevent logical duplicate assignments
    const [existing] = await pool.query(
      'SELECT user_id FROM staff_property_assignments WHERE user_id = ? AND property_id = ?',
      [userId, propertyId]
    );

    if (existing.length > 0) {
      throw new Error('This treasurer is already assigned to this property');
    }

    // 2. [DATA] Persistence: Grant management access via join-table entry
    const [result] = await pool.query(
      'INSERT INTO staff_property_assignments (user_id, property_id) VALUES (?, ?)',
      [userId, propertyId]
    );
    return result.insertId;
  }

  // REMOVE PROPERTY ASSIGNMENT: Revokes a staff member's management access to a building.
  async removePropertyAssignment(userId, propertyId) {
    // 1. [DATA] Cleanup
    const [result] = await pool.query(
      'DELETE FROM staff_property_assignments WHERE user_id = ? AND property_id = ?',
      [userId, propertyId]
    );
    return result.affectedRows > 0;
  }

  // GET ASSIGNED PROPERTIES: Lists all buildings under a staff member's active management.
  async getAssignedProperties(userId) {
    // 1. [QUERY] Extraction via Join-Table
    const [rows] = await pool.query(
      `SELECT p.*, spa.assigned_at 
            FROM properties p
            JOIN staff_property_assignments spa ON p.property_id = spa.property_id
            WHERE spa.user_id = ?`,
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

  // IS ASSIGNED TO PROPERTY: Low-latency check to verify management authorization.
  async isAssignedToProperty(userId, propertyId) {
    // 1. [SECURITY] Point Check: Validates assignment without pulling full building metadata
    const [rows] = await pool.query(
      'SELECT 1 FROM staff_property_assignments WHERE user_id = ? AND property_id = ? LIMIT 1',
      [userId, propertyId]
    );
    return rows.length > 0;
  }
}

export default new StaffModel();
