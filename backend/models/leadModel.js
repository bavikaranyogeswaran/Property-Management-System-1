import db from '../config/db.js';

class LeadModel {
    async create(data) {
        const { unitId, name, phone, email, notes, status = 'interested' } = data;
        const [result] = await db.query(
            `INSERT INTO leads (unit_id, name, phone, email, notes, status) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [unitId, name, phone, email, notes, status]
        );
        return result.insertId;
    }

    async findById(id) {
        const [rows] = await db.query(`
            SELECT 
                lead_id as id,
                unit_id as interestedUnit,
                name,
                email,
                phone,
                notes,
                status,
                created_at as createdAt,
                last_contacted_at as lastContactedAt,
                tenant_id as tenantId
            FROM leads WHERE lead_id = ?`, [id]);
        return rows[0];
    }

    async update(id, data) {
        // Dynamic update query
        const fields = [];
        const values = [];

        if (data.status) { fields.push('status = ?'); values.push(data.status); }
        if (data.tenantId) { fields.push('tenant_id = ?'); values.push(data.tenantId); }
        if (data.notes) { fields.push('notes = ?'); values.push(data.notes); }
        if (data.lastContactedAt) { fields.push('last_contacted_at = ?'); values.push(data.lastContactedAt); }


        if (fields.length === 0) return true;

        values.push(id);
        const [result] = await db.query(
            `UPDATE leads SET ${fields.join(', ')} WHERE lead_id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async findAll() {
        const [rows] = await db.query(`
            SELECT 
                lead_id as id,
                unit_id as interestedUnit,
                name,
                email,
                phone,
                notes,
                status,
                created_at as createdAt,
                last_contacted_at as lastContactedAt,
                tenant_id as tenantId
            FROM leads ORDER BY created_at DESC`);
        return rows;
    }
}

export default new LeadModel();
