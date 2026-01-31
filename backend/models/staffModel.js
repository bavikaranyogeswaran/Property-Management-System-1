import pool from '../config/db.js';

class StaffModel {
    async create(staffData, connection) {
        const {
            userId, nic, employeeId,
            department, jobTitle, shiftStart, shiftEnd
        } = staffData;

        // Uses the provided connection for transaction support
        const query = `
            INSERT INTO staff 
            (user_id, nic, employee_id, department, job_title, shift_start, shift_end) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.query(query, [
            userId, nic, employeeId,
            department, jobTitle, shiftStart, shiftEnd
        ]);

        return userId;
    }

    async findByUserId(userId) {
        const [rows] = await pool.query('SELECT * FROM staff WHERE user_id = ?', [userId]);
        return rows[0];
    }

    async assignProperty(userId, propertyId) {
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
        const [rows] = await pool.query(`
            SELECT p.*, spa.assigned_at 
            FROM properties p
            JOIN staff_property_assignments spa ON p.property_id = spa.property_id
            WHERE spa.user_id = ?
        `, [userId]);
        return rows;
    }
}

export default new StaffModel();
