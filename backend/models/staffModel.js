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
}

export default new StaffModel();
