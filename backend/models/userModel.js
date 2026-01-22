import pool from '../config/db.js';

class UserModel {
    async findByEmail(email) {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0];
    }

    async findById(id) {
        const [rows] = await pool.query('SELECT * FROM users WHERE user_id = ?', [id]);
        return rows[0];
    }

    async create(userData) {
        const { name, email, phone, passwordHash, role, status = 'active' } = userData;
        const [result] = await pool.query(
            'INSERT INTO users (name, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)',
            [name, email, phone, passwordHash, role, status]
        );
        return result.insertId;
    }

    async countByRole(role) {
        const [rows] = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = ?', [role]);
        return rows[0].count;
    }

    async update(id, updateData) {
        const { name, email, phone, status } = updateData;
        // Build query dynamically based on provided fields? 
        // For simplicity now, we assume these specific fields are passed.
        // If password update is needed later, separate method is better.
        const [result] = await pool.query(
            'UPDATE users SET name = ?, email = ?, phone = ?, status = ? WHERE user_id = ?',
            [name, email, phone, status, id]
        );
        return result.affectedRows > 0;
    }

    async delete(id) {
        const [result] = await pool.query('DELETE FROM users WHERE user_id = ?', [id]);
        return result.affectedRows > 0;
    }
}

export default new UserModel();
