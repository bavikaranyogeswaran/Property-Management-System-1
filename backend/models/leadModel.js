import db from '../config/db.js';
import leadStageHistoryModel from './leadStageHistoryModel.js';

class LeadModel {
    async create(data) {
        const { propertyId, unitId, interestedUnit, name, phone, email, notes, status = 'interested' } = data;

        // Handle alias and empty string
        let finalUnitId = unitId || interestedUnit;
        if (finalUnitId === '' || finalUnitId === 'null') {
            finalUnitId = null;
        }

        const [result] = await db.query(
            `INSERT INTO leads (property_id, unit_id, name, phone, email, notes, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [propertyId, finalUnitId, name, phone, email, notes, status]
        );

        const leadId = result.insertId;

        // Create initial stage history record
        await leadStageHistoryModel.create(leadId, null, status, 'Lead created');

        return leadId;
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
        // Get current lead status before updating (for history tracking)
        const currentLead = await this.findById(id);
        if (!currentLead) return false;

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

        // Track status change in history if status was updated
        if (data.status && data.status !== currentLead.status) {
            await leadStageHistoryModel.create(
                id,
                currentLead.status,
                data.status,
                data.notes || 'Status updated'
            );
        }

        return result.affectedRows > 0;
    }

    async findAll() {
        const [rows] = await db.query(`
            SELECT 
                lead_id as id,
                property_id as propertyId,
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
