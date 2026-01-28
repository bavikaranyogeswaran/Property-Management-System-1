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
        return rows[0];
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
}

export default new TenantModel();
