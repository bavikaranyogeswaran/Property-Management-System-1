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
      status = 'interested',
    } = data;

    // Handle alias and empty string
    let finalUnitId = unitId || interestedUnit;
    if (finalUnitId === '' || finalUnitId === 'null') {
      finalUnitId = null;
    }

    const [result] = await db.query(
      `INSERT INTO leads (property_id, unit_id, name, phone, email, notes, move_in_date, occupants_count, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        propertyId,
        finalUnitId,
        name,
        phone,
        email,
        notes,
        move_in_date || null,
        occupants_count || 1,
        status,
      ]
    );

    const leadId = result.insertId;

    // Create initial stage history record
    await leadStageHistoryModel.create(leadId, null, status, 'Lead created');

    return leadId;
  }

  async findById(id) {
    const [rows] = await db.query(
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
                status,
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
      const [rows] = await dbConn.query('SELECT status FROM leads WHERE lead_id = ?', [id]);
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
    if (data.move_in_date !== undefined) {
      fields.push('move_in_date = ?');
      values.push(data.move_in_date);
    }
    if (data.occupants_count !== undefined) {
      fields.push('occupants_count = ?');
      values.push(data.occupants_count);
    }
    if (data.notes !== undefined) {
      fields.push('notes = ?');
      values.push(data.notes);
    }
    if (data.internalNotes !== undefined) {
      fields.push('internal_notes = ?');
      values.push(data.internalNotes);
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
    if (result.affectedRows > 0 && data.status && currentStatus && currentStatus !== data.status) {
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
                    l.status,
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
                status,
                created_at as createdAt,
                last_contacted_at as lastContactedAt
            FROM leads ORDER BY created_at DESC`);
    return rows;
  }
  async findIdByEmailAndProperty(email, propertyId) {
    const [rows] = await db.query(
      `SELECT lead_id FROM leads WHERE email = ? AND property_id = ? AND status NOT IN ('dropped', 'converted') LIMIT 1`,
      [email, propertyId]
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
        status,
        created_at as createdAt,
        last_contacted_at as lastContactedAt
       FROM leads WHERE email = ? AND status != 'dropped' ORDER BY created_at DESC LIMIT 1`,
      [email]
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
}

export default new LeadModel();
