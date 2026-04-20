// ============================================================================
//  VISIT MODEL (The Calendar)
// ============================================================================
//  Stores scheduled property viewings for leads.
// ============================================================================

import db from '../config/db.js';

class VisitModel {
  // CREATE: Schedules a new property viewing, ensuring data normalization between leads and guests.
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
      assignedStaffId,
    } = data;

    // 1. [DATA] Redundancy Cleanup: don't store contact info if linked to a lead (Source of Truth resolution)
    const finalName = leadId ? null : visitorName;
    const finalEmail = leadId ? null : visitorEmail;
    const finalPhone = leadId ? null : visitorPhone;

    // 2. [DATA] Persistence: records the appointment with optional unit and staff assignment
    const [result] = await db.query(
      `INSERT INTO property_visits 
            (property_id, unit_id, lead_id, visitor_name, visitor_email, visitor_phone, scheduled_date, notes, assigned_staff_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        propertyId,
        unitId || null,
        leadId,
        finalName,
        finalEmail,
        finalPhone,
        scheduledDate,
        notes,
        assignedStaffId || null,
      ]
    );

    return result.insertId;
  }

  // FIND ALL: Lists scheduled visits across the portfolio, resolving contact details dynamically.
  async findAll(filters = {}) {
    // 1. [QUERY] Unified Projection: Coalesces lead info or guest info into a single 'resolved' identity
    let query = `
            SELECT 
                v.*, p.name as property_name, u.unit_number as unit_number, l.status as lead_status,
                COALESCE(l.name, v.visitor_name) as resolved_name,
                COALESCE(l.email, v.visitor_email) as resolved_email,
                COALESCE(l.phone, v.visitor_phone) as resolved_phone,
                s.name as assigned_staff_name
            FROM property_visits v
            JOIN properties p ON v.property_id = p.property_id
            LEFT JOIN units u ON v.unit_id = u.unit_id
            LEFT JOIN leads l ON v.lead_id = l.lead_id
            LEFT JOIN users s ON v.assigned_staff_id = s.user_id
            WHERE 1=1
        `;
    const params = [];

    // 2. [SECURITY] Filter Injection: handles owner/property scoping
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
      visitorName: row.resolved_name,
      visitorEmail: row.resolved_email,
      visitorPhone: row.resolved_phone,
      scheduledDate: row.scheduled_date,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      propertyName: row.property_name,
      unitNumber: row.unit_number,
      leadStatus: row.lead_status,
      assignedStaffId: row.assigned_staff_id
        ? row.assigned_staff_id.toString()
        : null,
      assignedStaffName: row.assigned_staff_name || null,
    }));
  }

  // UPDATE: Modifies visit details using dynamic field mapping.
  async update(visitId, data) {
    const fields = [];
    const params = [];

    // 1. [TRANSFORMATION] Case Normalization: maps camelCase keys to snake_case storage columns
    Object.keys(data).forEach((key) => {
      const snakeKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      fields.push(`${snakeKey} = ?`);
      params.push(data[key]);
    });

    if (fields.length === 0) return false;

    params.push(visitId);
    // 2. [DATA] Persistence
    const [result] = await db.query(
      `UPDATE property_visits SET ${fields.join(', ')} WHERE visit_id = ?`,
      params
    );
    return result.affectedRows > 0;
  }

  // UPDATE STATUS: Moves a visit through its lifecycle (Confirmed, Completed, No-Show).
  async updateStatus(visitId, status) {
    // 1. [DATA] Persistence
    const [result] = await db.query(
      `UPDATE property_visits SET status = ? WHERE visit_id = ?`,
      [status, visitId]
    );
    return result.affectedRows > 0;
  }

  // FIND BY ID: Fetches a single visit with resolved visitor identity.
  async findById(visitId) {
    // 1. [QUERY] Logic: Prioritizes lead contact info over guest fallback
    const [rows] = await db.query(
      `SELECT 
        v.*,
        COALESCE(l.name, v.visitor_name) as resolved_name,
        COALESCE(l.email, v.visitor_email) as resolved_email,
        COALESCE(l.phone, v.visitor_phone) as resolved_phone
       FROM property_visits v
       LEFT JOIN leads l ON v.lead_id = l.lead_id
       WHERE v.visit_id = ?`,
      [visitId]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.visit_id.toString(),
      propertyId: row.property_id.toString(),
      unitId: row.unit_id ? row.unit_id.toString() : null,
      leadId: row.lead_id ? row.lead_id.toString() : null,
      visitorName: row.resolved_name,
      visitorEmail: row.resolved_email,
      visitorPhone: row.resolved_phone,
      scheduledDate: row.scheduled_date,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
    };
  }

  // CANCEL VISITS FOR UNIT: Automated cleanup of pending viewings when a unit is leased.
  async cancelVisitsForUnit(unitId, date, connection = null) {
    const dbConn = connection || db;
    // 1. [DATA] Bulk Archival: moves pending appointments to 'cancelled' status
    await dbConn.query(
      `UPDATE property_visits 
             SET status = 'cancelled', notes = CONCAT(COALESCE(notes, ''), ' [System: Unit Leased]') 
             WHERE unit_id = ? AND status IN ('pending', 'confirmed') AND scheduled_date >= ?`,
      [unitId, date]
    );
  }

  // CANCEL VISITS FOR LEAD: Logic cleanup when a lead is dropped from the sales funnel.
  async cancelVisitsForLead(leadId, connection = null) {
    const dbConn = connection || db;
    // 1. [DATA] Persistence
    await dbConn.query(
      `UPDATE property_visits
       SET status = 'cancelled', notes = CONCAT(COALESCE(notes, ''), ' [System: Lead dropped]')
       WHERE lead_id = ? AND status IN ('pending', 'confirmed')`,
      [leadId]
    );
  }

  // EXISTS IN SLOT: Checks for scheduling conflicts at the room level.
  async existsInSlot(unitId, scheduledDate, excludeVisitId = null) {
    if (!unitId) return false;
    // 1. [QUERY] Proximity Logic: Enforces a 30-minute buffer between visits for the same unit
    const query = `
      SELECT visit_id FROM property_visits 
      WHERE unit_id = ? 
      AND scheduled_date BETWEEN DATE_SUB(?, INTERVAL 30 MINUTE) AND DATE_ADD(?, INTERVAL 30 MINUTE)
      AND status IN ('pending', 'confirmed')
      ${excludeVisitId ? 'AND visit_id != ?' : ''}
    `;
    const params = [unitId, scheduledDate, scheduledDate];
    if (excludeVisitId) params.push(excludeVisitId);

    const [rows] = await db.query(query, params);
    return rows.length > 0;
  }

  // COUNT IN SLOT BY PROPERTY: Checks for scheduling density at the building level.
  async countInSlotByProperty(
    propertyId,
    scheduledDate,
    excludeVisitId = null
  ) {
    if (!propertyId) return 0;
    // 1. [QUERY] Density Logic: Prevents over-scheduling staff by limiting concurrent building visits
    const query = `
      SELECT COUNT(*) as count FROM property_visits 
      WHERE property_id = ? 
      AND scheduled_date BETWEEN DATE_SUB(?, INTERVAL 30 MINUTE) AND DATE_ADD(?, INTERVAL 30 MINUTE)
      AND status IN ('pending', 'confirmed')
      ${excludeVisitId ? 'AND visit_id != ?' : ''}
    `;
    const params = [propertyId, scheduledDate, scheduledDate];
    if (excludeVisitId) params.push(excludeVisitId);

    const [rows] = await db.query(query, params);
    return rows[0].count;
  }

  // FIND UPCOMING: Retrieves immediate appointments for notification or staff preparation.
  async findUpcoming(hoursAhead = 24) {
    // 1. [QUERY] Date-based window extraction
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
