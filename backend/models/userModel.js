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

    async findTenantsByOwner(ownerId) {
        // Get tenants who have leases OR were converted from leads for this owner's properties
        const [rows] = await pool.query(`
            SELECT DISTINCT 
                u.user_id as id, 
                u.name, 
                u.email, 
                u.phone, 
                u.role, 
                u.status, 
                u.created_at as createdAt,
                t.nic, t.permanent_address, t.employer_name
            FROM users u
            JOIN tenants t ON u.user_id = t.user_id
            -- Join path 1: via Leases
            LEFT JOIN leases l ON u.user_id = l.tenant_id
            LEFT JOIN units ut ON l.unit_id = ut.unit_id
            LEFT JOIN properties p_lease ON ut.property_id = p_lease.property_id
            
            -- Join path 2: via Leads (converted)
            LEFT JOIN leads ld ON u.user_id = ld.tenant_id
            LEFT JOIN properties p_lead ON ld.property_id = p_lead.property_id
            
            WHERE u.role = 'tenant' 
                AND (p_lease.owner_id = ? OR p_lead.owner_id = ?)
                AND u.email NOT LIKE "deleted_%"
            ORDER BY u.created_at DESC
        `, [ownerId, ownerId]);
        return rows;
    }

    async findById(id) {
        // We first fetch the user to know the role, or we just LEFT JOIN everything.
        // Joining everything is safer to fetch all data in one go.
        const query = `
            SELECT u.*, 
                   t.nic as tenant_nic, t.permanent_address, t.employer_name, t.monthly_income,
                   o.nic as owner_nic, o.tin, o.bank_name, o.account_number,
                   s.employee_id, s.job_title
            FROM users u
            LEFT JOIN tenants t ON u.user_id = t.user_id
            LEFT JOIN owners o ON u.user_id = o.user_id
            LEFT JOIN staff s ON u.user_id = s.user_id
            WHERE u.user_id = ?
        `;
        const [rows] = await pool.query(query, [id]);
        return rows[0];
    }

    async create(userData, connection) {
        const { name, email, phone, passwordHash, role, is_email_verified = false, status = 'active' } = userData;

        // Use provided connection or default pool (for non-transactional calls)
        const db = connection || pool;

        const [result] = await db.query(
            'INSERT INTO users (name, email, phone, password_hash, role, is_email_verified, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, email, phone, passwordHash, role, is_email_verified, status]
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

    async updatePassword(id, passwordHash) {
        const [result] = await pool.query(
            'UPDATE users SET password_hash = ? WHERE user_id = ?',
            [passwordHash, id]
        );
        return result.affectedRows > 0;
    }

    async updateRole(id, role) {
        const [result] = await pool.query(
            'UPDATE users SET role = ? WHERE user_id = ?',
            [role, id]
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
    async verifyEmail(id) {
        const [result] = await pool.query(
            'UPDATE users SET is_email_verified = TRUE, email_verified_at = NOW(), status = "active" WHERE user_id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }

    async setupPassword(id, passwordHash) {
        const [result] = await pool.query(
            'UPDATE users SET password_hash = ?, is_email_verified = TRUE, email_verified_at = NOW(), status = "active" WHERE user_id = ?',
            [passwordHash, id]
        );
        return result.affectedRows > 0;
    }
}

export default new UserModel();
