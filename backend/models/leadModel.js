// ============================================================================
//  LEAD MODEL (The Rolodex)
// ============================================================================
//  Stores details about potential tenants who are interested in moving in.
// ============================================================================

import db from '../config/db.js';
import leadStageHistoryModel from './leadStageHistoryModel.js';

class LeadModel {
  async create(data) {
    const {
      propertyId,
      unitId,
      interestedUnit,
      name,
      phone,
      email,
      notes,
      move_in_date,
      occupants_count,
      preferred_term_months,
      lease_term_id,
      status = 'interested',
      score = 0,
    } = data;

    let finalUnitId = unitId || interestedUnit;
    if (finalUnitId === '' || finalUnitId === 'null') {
      finalUnitId = null;
    }

    const normalizedEmail = email ? email.toLowerCase().trim() : null;

    if (!normalizedEmail) {
      const error = new Error('Email is required for creating a lead.');
      error.status = 400; // Bad Request
      throw error;
    }

    const [result] = await db.query(
      `INSERT INTO leads (property_id, unit_id, name, phone, email, notes, move_in_date, occupants_count, preferred_term_months, lease_term_id, status, score) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        propertyId,
        finalUnitId,
        name,
        phone,
        normalizedEmail,
        notes,
        move_in_date || null,
        occupants_count || 1,
        preferred_term_months || null,
        lease_term_id || null,
        status,
        score || 0,
      ]
    );

    const leadId = result.insertId;

    // Create initial stage history record
    await leadStageHistoryModel.create(leadId, null, status, 'Lead created');

    return leadId;
  }

  async findById(id, connection = null) {
    const dbConn = connection || db;
    const [rows] = await dbConn.query(
      `
            SELECT 
                lead_id as id,
                property_id as propertyId,
                unit_id as interestedUnit,
                name,
                email,
                phone,
                notes,
                internal_notes as internalNotes,
                move_in_date as moveInDate,
                occupants_count as occupantsCount,
                preferred_term_months as preferredTermMonths,
                lease_term_id as leaseTermId,
                status,
                score,
                created_at as createdAt,
                last_contacted_at as lastContactedAt
            FROM leads WHERE lead_id = ?`,
      [id]
    );
    return rows[0];
  }

  async update(id, data, connection = null) {
    const dbConn = connection || db;

    // Fetch current status to detect transitions for history tracking
    let currentStatus = null;
    if (data.status) {
      const [rows] = await dbConn.query(
        'SELECT status FROM leads WHERE lead_id = ?',
        [id]
      );
      if (rows.length > 0) {
        currentStatus = rows[0].status;
      }
    }

    const fields = [];
    const values = [];

    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.unitId !== undefined) {
      fields.push('unit_id = ?');
      values.push(data.unitId);
    }
    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.phone !== undefined) {
      fields.push('phone = ?');
      values.push(data.phone);
    }
    const moveIn = data.moveInDate || data.move_in_date;
    if (moveIn !== undefined) {
      fields.push('move_in_date = ?');
      values.push(moveIn);
    }
    const occupants = data.occupantsCount || data.occupants_count;
    if (occupants !== undefined) {
      fields.push('occupants_count = ?');
      values.push(occupants);
    }
    const term = data.preferredTermMonths || data.preferred_term_months;
    if (term !== undefined) {
      fields.push('preferred_term_months = ?');
      values.push(term);
    }
    const leaseTermId = data.leaseTermId || data.lease_term_id;
    if (leaseTermId !== undefined) {
      fields.push('lease_term_id = ?');
      values.push(leaseTermId);
    }
    if (data.notes !== undefined) {
      fields.push('notes = ?');
      values.push(data.notes);
    }
    if (data.internalNotes !== undefined) {
      fields.push('internal_notes = ?');
      values.push(data.internalNotes);
    }
    if (data.score !== undefined) {
      fields.push('score = ?');
      values.push(data.score);
    }
    if (data.lastContactedAt !== undefined) {
      fields.push('last_contacted_at = ?');
      values.push(data.lastContactedAt);
    }

    if (fields.length === 0) return true;

    values.push(id);
    const [result] = await dbConn.query(
      `UPDATE leads SET ${fields.join(', ')} WHERE lead_id = ?`,
      values
    );

    // Log history if the status actually changed
    if (
      result.affectedRows > 0 &&
      data.status &&
      currentStatus &&
      currentStatus !== data.status
    ) {
      await leadStageHistoryModel.create(
        id,
        currentStatus,
        data.status,
        'Status updated',
        dbConn
      );
    }
    return result.affectedRows > 0;
  }

  async findAll(ownerId = null) {
    // If ownerId is provided, filter leads by owner through properties
    if (ownerId) {
      const [rows] = await db.query(
        `
                SELECT 
                    l.lead_id as id,
                    l.property_id as propertyId,
                    l.unit_id as interestedUnit,
                    l.name,
                    l.email,
                    l.phone,
                    l.notes,
                    l.internal_notes as internalNotes,
                    l.move_in_date as moveInDate,
                    l.occupants_count as occupantsCount,
                    l.preferred_term_months as preferredTermMonths,
                    l.lease_term_id as leaseTermId,
                    l.status,
                    l.score,
                    l.created_at as createdAt,
                    l.last_contacted_at as lastContactedAt
                FROM leads l
                INNER JOIN properties p ON l.property_id = p.property_id
                WHERE p.owner_id = ?
                ORDER BY l.created_at DESC`,
        [ownerId]
      );
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
                internal_notes as internalNotes,
                move_in_date as moveInDate,
                occupants_count as occupantsCount,
                preferred_term_months as preferredTermMonths,
                lease_term_id as leaseTermId,
                status,
                score,
                created_at as createdAt,
                last_contacted_at as lastContactedAt
            FROM leads ORDER BY created_at DESC`);
    return rows;
  }
  async findIdByEmailAndProperty(email, propertyId) {
    const normalizedEmail = email ? email.toLowerCase().trim() : null;
    const [rows] = await db.query(
      `SELECT lead_id FROM leads WHERE email = ? AND property_id = ? AND status NOT IN ('dropped', 'converted') LIMIT 1`,
      [normalizedEmail, propertyId]
    );
    return rows.length > 0 ? rows[0].lead_id : null;
  }

  async dropLeadsForUnit(unitId, connection = null) {
    const dbConn = connection || db;

    // Find leads before updating to log history
    const [leadsToDrop] = await dbConn.query(
      `SELECT lead_id, status FROM leads WHERE unit_id = ? AND status = 'interested'`,
      [unitId]
    );

    await dbConn.query(
      `UPDATE leads 
             SET status = 'dropped', notes = CONCAT(COALESCE(notes, ''), ' [System: Unit Leased]') 
             WHERE unit_id = ? AND status = 'interested'`,
      [unitId]
    );

    // Create history for each dropped lead
    for (const lead of leadsToDrop) {
      await leadStageHistoryModel.create(
        lead.lead_id,
        lead.status,
        'dropped',
        'System: Unit Leased',
        dbConn
      );
    }
  }
  async findByEmail(email) {
    const normalizedEmail = email ? email.toLowerCase().trim() : null;
    const [rows] = await db.query(
      `SELECT 
        lead_id as id,
        property_id as propertyId,
        unit_id as interestedUnit,
        name,
        email,
        phone,
        notes,
        internal_notes as internalNotes,
        move_in_date as moveInDate,
        occupants_count as occupantsCount,
        preferred_term_months as preferredTermMonths,
        lease_term_id as leaseTermId,
        status,
        score,
        created_at as createdAt,
        last_contacted_at as lastContactedAt
       FROM leads WHERE email = ? AND status != 'dropped' ORDER BY created_at DESC LIMIT 1`,
      [normalizedEmail]
    );
    return rows[0];
  }

  async verifyOwnership(leadId, ownerId) {
    const [rows] = await db.query(
      `SELECT l.lead_id FROM leads l
       INNER JOIN properties p ON l.property_id = p.property_id
       WHERE l.lead_id = ? AND p.owner_id = ?`,
      [leadId, ownerId]
    );
    return rows.length > 0;
  }

  // Analytics optimized query to avoid O(N) memory buildup
  // DB enum: 'interested', 'converted', 'dropped'
  async getLeadConversionStats(ownerId, startDate = null, endDate = null) {
    let query = `
      SELECT 
        COUNT(*) AS Total,
        SUM(CASE WHEN l.status = 'interested' THEN 1 ELSE 0 END) AS Interested,
        SUM(CASE WHEN l.status = 'converted' THEN 1 ELSE 0 END) AS Converted,
        SUM(CASE WHEN l.status = 'dropped' THEN 1 ELSE 0 END) AS Dropped
      FROM leads l
    `;
    const params = [];
    const conditions = [];

    if (ownerId) {
      query += ` INNER JOIN properties p ON l.property_id = p.property_id`;
      conditions.push(`p.owner_id = ?`);
      params.push(ownerId);
    }

    if (startDate && endDate) {
      conditions.push(`l.created_at BETWEEN ? AND ?`);
      params.push(startDate, endDate);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    const [rows] = await db.query(query, params);
    return rows[0];
  }

  async findByTreasurerId(treasurerId) {
    const [rows] = await db.query(
      `
      SELECT l.lead_id as id, l.property_id as propertyId, l.unit_id as interestedUnit,
             l.name, l.email, l.phone, l.notes, l.internal_notes as internalNotes,
             l.move_in_date as moveInDate, l.occupants_count as occupantsCount,
             l.preferred_term_months as preferredTermMonths, l.lease_term_id as leaseTermId,
             l.status, l.score, l.created_at as createdAt, l.last_contacted_at as lastContactedAt
      FROM leads l
      INNER JOIN properties p ON l.property_id = p.property_id
      INNER JOIN staff_property_assignments spa ON p.property_id = spa.property_id
      WHERE spa.user_id = ?
      ORDER BY l.created_at DESC`,
      [treasurerId]
    );
    return rows;
  }

  async expireStaleLeads(daysThreshold = 90) {
    // Find stale leads before updating (for stage history)
    const [staleLeads] = await db.query(
      `SELECT lead_id, status FROM leads
       WHERE status = 'interested'
       AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
       AND (last_contacted_at IS NULL OR last_contacted_at < DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [daysThreshold, daysThreshold]
    );

    if (staleLeads.length === 0) return 0;

    // Bulk update
    const ids = staleLeads.map((l) => l.lead_id);
    await db.query(
      `UPDATE leads SET status = 'dropped',
       notes = CONCAT(COALESCE(notes, ''), ' [System: Auto-expired after ${daysThreshold} days of inactivity]')
       WHERE lead_id IN (?)`,
      [ids]
    );

    // Log stage history for each
    for (const lead of staleLeads) {
      await leadStageHistoryModel.create(
        lead.lead_id,
        lead.status,
        'dropped',
        `System: Auto-expired after ${daysThreshold} days`
      );
    }

    return staleLeads.length;
  }
}

export default new LeadModel();
