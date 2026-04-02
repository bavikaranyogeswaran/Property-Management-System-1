import db from '../config/db.js';

class VisitModel {
  async create(data) {
    const {
      propertyId,
      unitId,
      leadId,
      visitorName,
      visitorEmail,
      visitorPhone,
      scheduledDate,
      notes,
    } = data;

    const [result] = await db.query(
      `INSERT INTO property_visits 
            (property_id, unit_id, lead_id, visitor_name, visitor_email, visitor_phone, scheduled_date, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        propertyId,
        unitId || null,
        leadId,
        visitorName,
        visitorEmail,
        visitorPhone,
        scheduledDate,
        notes,
      ]
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

    if (filters.propertyIds && filters.propertyIds.length > 0) {
      query += ` AND v.property_id IN (?)`;
      params.push(filters.propertyIds);
    }

    query += ` ORDER BY v.scheduled_date ASC`;

    const [rows] = await db.query(query, params);
    return rows.map((row) => ({
      id: row.visit_id.toString(),
      propertyId: row.property_id.toString(),
      unitId: row.unit_id ? row.unit_id.toString() : null,
      leadId: row.lead_id ? row.lead_id.toString() : null,
      visitorName: row.visitor_name,
      visitorEmail: row.visitor_email,
      visitorPhone: row.visitor_phone,
      scheduledDate: row.scheduled_date,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      // Joined fields
      propertyName: row.property_name,
      unitNumber: row.unit_number,
      leadStatus: row.lead_status,
    }));
  }

  async updateStatus(visitId, status) {
    const [result] = await db.query(
      `UPDATE property_visits SET status = ? WHERE visit_id = ?`,
      [status, visitId]
    );
    return result.affectedRows > 0;
  }

  async findById(visitId) {
    const [rows] = await db.query(
      `SELECT * FROM property_visits WHERE visit_id = ?`,
      [visitId]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.visit_id.toString(),
      propertyId: row.property_id.toString(),
      unitId: row.unit_id ? row.unit_id.toString() : null,
      leadId: row.lead_id ? row.lead_id.toString() : null,
      visitorName: row.visitor_name,
      visitorEmail: row.visitor_email,
      visitorPhone: row.visitor_phone,
      scheduledDate: row.scheduled_date,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
    };
  }
  async cancelVisitsForUnit(unitId, date, connection = null) {
    const dbConn = connection || db;
    await dbConn.query(
      `UPDATE property_visits 
             SET status = 'cancelled', notes = CONCAT(COALESCE(notes, ''), ' [System: Unit Leased]') 
             WHERE unit_id = ? AND status IN ('pending', 'confirmed') AND scheduled_date >= ?`,
      [unitId, date]
    );
  }

  async cancelVisitsForLead(leadId, connection = null) {
    const dbConn = connection || db;
    await dbConn.query(
      `UPDATE property_visits
       SET status = 'cancelled', notes = CONCAT(COALESCE(notes, ''), ' [System: Lead dropped]')
       WHERE lead_id = ? AND status IN ('pending', 'confirmed')`,
      [leadId]
    );
  }

  async existsInSlot(unitId, scheduledDate) {
    if (!unitId) return false;
    const [rows] = await db.query(
      `SELECT visit_id FROM property_visits 
             WHERE unit_id = ? AND scheduled_date = ? AND status IN ('pending', 'confirmed')`,
      [unitId, scheduledDate]
    );
    return rows.length > 0;
  }

  async countInSlotByProperty(propertyId, scheduledDate) {
    if (!propertyId) return 0;
    const [rows] = await db.query(
      `SELECT COUNT(*) as count FROM property_visits 
             WHERE property_id = ? AND scheduled_date = ? AND status IN ('pending', 'confirmed')`,
      [propertyId, scheduledDate]
    );
    return rows[0].count;
  }

  async findUpcoming(hoursAhead = 24) {
    const [rows] = await db.query(
      `SELECT v.*, p.name as property_name, u.unit_number
       FROM property_visits v
       JOIN properties p ON v.property_id = p.property_id
       LEFT JOIN units u ON v.unit_id = u.unit_id
       WHERE v.status IN ('pending', 'confirmed')
       AND v.scheduled_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? HOUR)`,
      [hoursAhead]
    );
    return rows;
  }
}

export default new VisitModel();
