import db from '../config/db.js';
import leadStageHistoryModel from './leadStageHistoryModel.js';

class LeadModel {
    async create(data) {
        const { propertyId, unitId, interestedUnit, userId, name, phone, email, notes, status = 'interested' } = data;

        // Handle alias and empty string
        let finalUnitId = unitId || interestedUnit;
        if (finalUnitId === '' || finalUnitId === 'null') {
            finalUnitId = null;
        }

        const [result] = await db.query(
            `INSERT INTO leads (property_id, unit_id, user_id, name, phone, email, notes, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [propertyId, finalUnitId, userId, name, phone, email, notes, status]
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
                user_id as userId
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
        if (data.userId) { fields.push('user_id = ?'); values.push(data.userId); }
        if (data.tenantId) { fields.push('user_id = ?'); values.push(data.tenantId); } // Backward compat alias
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

    async findAll(ownerId = null) {
        // If ownerId is provided, filter leads by owner through properties
        if (ownerId) {
            const [rows] = await db.query(`
                SELECT 
                    l.lead_id as id,
                    l.property_id as propertyId,
                    l.unit_id as interestedUnit,
                    l.name,
                    l.email,
                    l.phone,
                    l.notes,
                    l.status,
                    l.created_at as createdAt,
                    l.last_contacted_at as lastContactedAt,
                    l.last_contacted_at as lastContactedAt,
                    l.user_id as userId
                FROM leads l
                INNER JOIN properties p ON l.property_id = p.property_id
                WHERE p.owner_id = ?
                ORDER BY l.created_at DESC`, [ownerId]);
            return rows;
        }

        // Otherwise return all leads (for admin or backward compatibility)
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
                last_contacted_at as lastContactedAt,
                user_id as userId
            FROM leads ORDER BY created_at DESC`);
        return rows;
    }
}

export default new LeadModel();
