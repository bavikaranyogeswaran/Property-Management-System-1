import pool from '../config/db.js';

class UserModel {
    async findByEmail(email) {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0];
    }

    async findByRole(role) {
        // Exclude inactive/deleted users?
        // The user wants to see "active" and "inactive", but maybe not "deleted" (which are soft deleted with status 'inactive' AND email renamed).
        // Actually, soft delete logic sets status='inactive' and email='deleted_...'.
        // If we just show all users with role=?, we clearly see them. 
        // But usually we don't want to show soft-deleted users.
        // Let's assume soft-deleted users are identified by 'deleted_' prefix in email or we rely on status.
        // But regular inactive users are also 'inactive'.
        // Let's filter out those with 'deleted_%' email pattern if possible, or just return all and let service filter.
        // Better: The requirement was "owner remove a treasurer... email must be able to be used again".
        // The soft delete implementation renames the email.
        // So we should probably exclude users where email LIKE 'deleted_%'.

        const [rows] = await pool.query('SELECT user_id as id, name, email, phone, role, status, created_at as createdAt FROM users WHERE role = ? AND email NOT LIKE "deleted_%"', [role]);
        return rows;
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
        try {
            // 1. Try Hard Delete first (Permanent removal)
            const [result] = await pool.query('DELETE FROM users WHERE user_id = ?', [id]);
            return result.affectedRows > 0;
        } catch (error) {
            // 2. If Foreign Key constraint fails (code 1451), fall back to Soft Delete
            if (error.errno === 1451) {
                console.log(`[Smart Delete] User ${id} has related data. Falling back to Soft Delete.`);

                // Fetch user first to get email
                const user = await this.findById(id);
                if (!user) return false;

                const archivedEmail = `deleted_${id}_${Date.now()}_${user.email}`.substring(0, 100);

                const [result] = await pool.query(
                    'UPDATE users SET email = ?, status = ?, name = CONCAT(name, " (Deleted)") WHERE user_id = ?',
                    [archivedEmail, 'inactive', id]
                );
                return result.affectedRows > 0;
            }

            // Re-throw other errors
            throw error;
        }
    }
}

export default new UserModel();
