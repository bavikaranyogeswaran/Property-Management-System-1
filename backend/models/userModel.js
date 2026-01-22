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
        const { name, email, passwordHash, role, status = 'active' } = userData;
        const [result] = await pool.query(
            'INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
            [name, email, passwordHash, role, status]
        );
        return result.insertId;
    }

    async countByRole(role) {
        const [rows] = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = ?', [role]);
        return rows[0].count;
    }
}

export default new UserModel();
