// ============================================================================
//  LEAD MODEL (The Rolodex)
// ============================================================================
//  Stores details about potential tenants who are interested in moving in.
// ============================================================================

import db from '../config/db.js';
import leadStageHistoryModel from './leadStageHistoryModel.js';

class LeadModel {
  // CREATE: Registers a new prospective tenant and initializes their journey.
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

    // 1. [TRANSFORMATION] Data Normalization: Sanitize identifiers and email formats
    let finalUnitId = unitId || interestedUnit;
    if (finalUnitId === '' || finalUnitId === 'null') finalUnitId = null;
    const normalizedEmail = email ? email.toLowerCase().trim() : null;

    if (!normalizedEmail) {
      const error = new Error('Email is required for creating a lead.');
      error.status = 400;
      throw error;
    }

    // 2. [DATA] Persistence: Insert the lead as the primary prospect record
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

    // 3. [SIDE EFFECT] Stage History: Log the initial entry into the conversion funnel
    await leadStageHistoryModel.create(leadId, null, status, 'Lead created');

    return leadId;
  }

  // FIND BY ID: Fetches the detailed profile for a specific lead.
  async findById(id, connection = null) {
    const dbConn = connection || db;
    // 1. [QUERY] Construction: Selecting with aliasing for camelCase DTOs
    const [rows] = await dbConn.query(
      `SELECT lead_id as id, property_id as propertyId, unit_id as interestedUnit, name, email, phone, notes, internal_notes as internalNotes,
              move_in_date as moveInDate, occupants_count as occupantsCount, preferred_term_months as preferredTermMonths,
              lease_term_id as leaseTermId, status, score, created_at as createdAt, last_contacted_at as lastContactedAt
       FROM leads WHERE lead_id = ?`,
      [id]
    );
    return rows[0];
  }

  // UPDATE: Modifies prospect details or advances their funnel status.
  async update(id, data, connection = null) {
    const dbConn = connection || db;

    // 1. [QUERY] Pre-fetch: Identify current status to detect transitions for history tracking
    let currentStatus = null;
    if (data.status) {
      const [rows] = await dbConn.query(
        'SELECT status FROM leads WHERE lead_id = ?',
        [id]
      );
      if (rows.length > 0) currentStatus = rows[0].status;
    }

    const fields = [];
    const values = [];

    // 2. [TRANSFORMATION] Dynamic Query Builder
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

    // 3. [SIDE EFFECT] Stage History Trigger: Auto-log transitions if the 'status' column changed
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

  // FIND ALL: Lists all active leads, optionally filtered by owner for portfolio isolation.
  async findAll(ownerId = null) {
    // 1. [QUERY] Filtered Join for Owners
    if (ownerId) {
      const [rows] = await db.query(
        `SELECT l.lead_id as id, l.property_id as propertyId, l.unit_id as interestedUnit, l.name, l.email, l.phone, l.notes, l.internal_notes as internalNotes,
                l.move_in_date as moveInDate, l.occupants_count as occupantsCount, l.preferred_term_months as preferredTermMonths,
                l.lease_term_id as leaseTermId, l.status, l.score, l.created_at as createdAt, l.last_contacted_at as lastContactedAt
         FROM leads l
         INNER JOIN properties p ON l.property_id = p.property_id
         WHERE p.owner_id = ? ORDER BY l.created_at DESC`,
        [ownerId]
      );
      return rows;
    }

    // 2. [QUERY] Generic Retrieval for Admins
    const [rows] = await db.query(`
            SELECT lead_id as id, property_id as propertyId, unit_id as interestedUnit, name, email, phone, notes, internal_notes as internalNotes,
                   move_in_date as moveInDate, occupants_count as occupantsCount, preferred_term_months as preferredTermMonths,
                   lease_term_id as leaseTermId, status, score, created_at as createdAt, last_contacted_at as lastContactedAt
            FROM leads ORDER BY created_at DESC`);
    return rows;
  }

  // FIND ID BY EMAIL AND PROPERTY: Checks for existing duplicate leads to prevent spamming.
  async findIdByEmailAndProperty(email, propertyId) {
    const normalizedEmail = email ? email.toLowerCase().trim() : null;
    const [rows] = await db.query(
      `SELECT lead_id FROM leads WHERE email = ? AND property_id = ? AND status NOT IN ('dropped', 'converted') LIMIT 1`,
      [normalizedEmail, propertyId]
    );
    return rows.length > 0 ? rows[0].lead_id : null;
  }

  // DROP LEADS FOR UNIT: Bulk archives interested prospects when an apartment is filled by another resident.
  async dropLeadsForUnit(unitId, connection = null) {
    const dbConn = connection || db;

    // 1. [QUERY] Pre-fetch: Identify which leads are being impacted to log their history
    const [leadsToDrop] = await dbConn.query(
      `SELECT lead_id, status FROM leads WHERE unit_id = ? AND status = 'interested'`,
      [unitId]
    );

    // 2. [DATA] Bulk Update
    await dbConn.query(
      `UPDATE leads SET status = 'dropped', notes = CONCAT(COALESCE(notes, ''), ' [System: Unit Leased]') 
       WHERE unit_id = ? AND status = 'interested'`,
      [unitId]
    );

    // 3. [SIDE EFFECT] Batch Logging: Record the 'dropped' event for the full audit trail
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

  // FIND BY EMAIL: Resolves the most recent active profile for a specific email address.
  async findByEmail(email) {
    const normalizedEmail = email ? email.toLowerCase().trim() : null;
    const [rows] = await db.query(
      `SELECT lead_id as id, property_id as propertyId, unit_id as interestedUnit, name, email, phone, notes, internal_notes as internalNotes,
              move_in_date as moveInDate, occupants_count as occupantsCount, preferred_term_months as preferredTermMonths,
              lease_term_id as leaseTermId, status, score, created_at as createdAt, last_contacted_at as lastContactedAt
       FROM leads WHERE email = ? AND status != 'dropped' ORDER BY created_at DESC LIMIT 1`,
      [normalizedEmail]
    );
    return rows[0];
  }

  // VERIFY OWNERSHIP: Security guard checking if a lead belongs to an Owner's properties.
  async verifyOwnership(leadId, ownerId) {
    const [rows] = await db.query(
      `SELECT l.lead_id FROM leads l
       INNER JOIN properties p ON l.property_id = p.property_id
       WHERE l.lead_id = ? AND p.owner_id = ?`,
      [leadId, ownerId]
    );
    return rows.length > 0;
  }

  // GET LEAD CONVERSION STATS: Analytics aggregator for conversion rates ( funnel visibility).
  async getLeadConversionStats(ownerId, startDate = null, endDate = null) {
    let query = `
      SELECT COUNT(*) AS Total,
             SUM(CASE WHEN l.status = 'interested' THEN 1 ELSE 0 END) AS Interested,
             SUM(CASE WHEN l.status = 'converted' THEN 1 ELSE 0 END) AS Converted,
             SUM(CASE WHEN l.status = 'dropped' THEN 1 ELSE 0 END) AS Dropped
      FROM leads l
    `;
    const params = [];
    const conditions = [];

    // 1. [QUERY] Dynamic Filter Construction
    if (ownerId) {
      query += ` INNER JOIN properties p ON l.property_id = p.property_id`;
      conditions.push(`p.owner_id = ?`);
      params.push(ownerId);
    }

    if (startDate && endDate) {
      conditions.push(`l.created_at BETWEEN ? AND ?`);
      params.push(startDate, endDate);
    }

    if (conditions.length > 0) query += ` WHERE ` + conditions.join(' AND ');

    // 2. [DATA] Collection
    const [rows] = await db.query(query, params);
    return rows[0];
  }

  // FIND BY TREASURER ID: Limits lead view based on staff property assignments.
  async findByTreasurerId(treasurerId) {
    // 1. [QUERY] Assigned Retrieval
    const [rows] = await db.query(
      `SELECT l.lead_id as id, l.property_id as propertyId, l.unit_id as interestedUnit,
              l.name, l.email, l.phone, l.notes, l.internal_notes as internalNotes,
              l.move_in_date as moveInDate, l.occupants_count as occupantsCount,
              l.preferred_term_months as preferredTermMonths, l.lease_term_id as leaseTermId,
              l.status, l.score, l.created_at as createdAt, l.last_contacted_at as lastContactedAt
       FROM leads l
       INNER JOIN properties p ON l.property_id = p.property_id
       INNER JOIN staff_property_assignments spa ON p.property_id = spa.property_id
       WHERE spa.user_id = ? ORDER BY l.created_at DESC`,
      [treasurerId]
    );
    return rows;
  }

  // EXPIRE STALE LEADS: Automated maintenance task for pruning inactive prospects.
  async expireStaleLeads(daysThreshold = 90) {
    // 1. [QUERY] Pre-fetch: Identify which prospects have "ghosted" the platform
    const [staleLeads] = await db.query(
      `SELECT lead_id, status FROM leads
       WHERE status = 'interested'
       AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
       AND (last_contacted_at IS NULL OR last_contacted_at < DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [daysThreshold, daysThreshold]
    );

    if (staleLeads.length === 0) return 0;

    const ids = staleLeads.map((l) => l.lead_id);
    // 2. [DATA] Bulk Update: Mark them as 'dropped' with a system note
    await db.query(
      `UPDATE leads SET status = 'dropped',
       notes = CONCAT(COALESCE(notes, ''), ' [System: Auto-expired after ${daysThreshold} days of inactivity]')
       WHERE lead_id IN (?)`,
      [ids]
    );

    // 3. [SIDE EFFECT] History Logging
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
