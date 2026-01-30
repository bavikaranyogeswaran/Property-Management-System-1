
import db from '../config/db.js';

class VisitModel {
    async create(data) {
        const { propertyId, unitId, leadId, visitorName, visitorEmail, visitorPhone, scheduledDate, notes } = data;

        const [result] = await db.query(
            `INSERT INTO property_visits 
            (property_id, unit_id, lead_id, visitor_name, visitor_email, visitor_phone, scheduled_date, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [propertyId, unitId || null, leadId, visitorName, visitorEmail, visitorPhone, scheduledDate, notes]
        );

        return result.insertId;
    }

    async findAll(filters = {}) {
        let query = `
            SELECT 
                v.*,
                p.name as property_name,
                u.unit_number as unit_number,
                l.status as lead_status
            FROM property_visits v
            JOIN properties p ON v.property_id = p.property_id
            LEFT JOIN units u ON v.unit_id = u.unit_id
            LEFT JOIN leads l ON v.lead_id = l.lead_id
            WHERE 1=1
        `;
        const params = [];

        if (filters.ownerId) {
            query += ` AND p.owner_id = ?`;
            params.push(filters.ownerId);
        }

        if (filters.propertyId) {
            query += ` AND v.property_id = ?`;
            params.push(filters.propertyId);
        }

        query += ` ORDER BY v.scheduled_date ASC`;

        const [rows] = await db.query(query, params);
        return rows;
    }

    async updateStatus(visitId, status) {
        const [result] = await db.query(
            `UPDATE property_visits SET status = ? WHERE visit_id = ?`,
            [status, visitId]
        );
        return result.affectedRows > 0;
    }
}

export default new VisitModel();
