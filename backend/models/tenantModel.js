import pool from '../config/db.js';

class TenantModel {
    async create(tenantData, connection) {
        const {
            userId, nic, permanentAddress,
            emergencyContactName, emergencyContactPhone,
            employerName, employmentStatus, monthlyIncome, dateOfBirth
        } = tenantData;

        // Uses the provided connection for transaction support
        const query = `
            INSERT INTO tenants 
            (user_id, nic, permanent_address, emergency_contact_name, emergency_contact_phone, 
             employer_name, employment_status, monthly_income, date_of_birth) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.query(query, [
            userId, nic, permanentAddress,
            emergencyContactName, emergencyContactPhone,
            employerName, employmentStatus, monthlyIncome, dateOfBirth
        ]);

        return userId;
    }

    async findByUserId(userId) {
        const [rows] = await pool.query('SELECT * FROM tenants WHERE user_id = ?', [userId]);
        const row = rows[0];
        if (!row) return null;
        return {
            userId: row.user_id,
            nic: row.nic,
            permanentAddress: row.permanent_address,
            emergencyContactName: row.emergency_contact_name,
            emergencyContactPhone: row.emergency_contact_phone,
            employerName: row.employer_name,
            employmentStatus: row.employment_status,
            monthlyIncome: parseFloat(row.monthly_income),
            dateOfBirth: row.date_of_birth,
            creditBalance: parseFloat(row.credit_balance || 0),
            behaviorScore: row.behavior_score
        };
    }

    async update(userId, data) {
        // Dynamic update would be better, but for now specific fields
        // Allowing selective updates
        const fields = [];
        const values = [];

        Object.keys(data).forEach(key => {
            // Map camelCase to snake_case if necessary, or just use snake_case in data object
            // Assuming data keys match column names or we map them.
            // Let's assume the service passes snake_case or we map manually. 
            // Ideally we map manually for safety.
        });

        // Needed for profile updates
        // For MVP, we might not implementation full profile update yet.
        return true;
    }

    async addCredit(userId, amount) {
        await pool.query(
            'UPDATE tenants SET credit_balance = credit_balance + ? WHERE user_id = ?',
            [amount, userId]
        );
    }
}


export default new TenantModel();
