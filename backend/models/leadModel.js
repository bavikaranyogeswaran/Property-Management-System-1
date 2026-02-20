import db from '../config/db.js';
import leadStageHistoryModel from './leadStageHistoryModel.js';

class LeadModel {
  async create(data) {
    const {
      propertyId,
      unitId,
      interestedUnit,
      userId,
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
      `INSERT INTO leads (property_id, unit_id, user_id, name, phone, email, notes, move_in_date, occupants_count, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        propertyId,
        finalUnitId,
        userId,
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
                move_in_date as moveInDate,
                occupants_count as occupantsCount,
                status,
                created_at as createdAt,
                last_contacted_at as lastContactedAt,
                user_id as userId
            FROM leads WHERE lead_id = ?`,
      [id]
    );
    return rows[0];
  }

  async update(id, data, connection = null) {
    const dbConn = connection || db;
    // Get current lead status before updating (for history tracking)
    // findById does not support connection yet, but reading is usually fine outside/inside lock?
    // Ideally findById should also support connection if inside transaction.
    // Let's update findById first? Or just use db for read (might miss uncommitted changes if repeatable read).
    // For now, let's use the connection for the update.
    
    // READ needs to use connection if we are in transaction to see our own changes, 
    // but here we are usually updating based on user input.
    // However, if we are converting lead, we might want to lock it?
    // Let's stick to simple update for now. 
    // We can't easily change findById without changing all calls.
    // But `update` definitely needs connection.
    
    // CAUTION: If we use `this.findById` it uses `db`. 
    // If we are in a transaction, `db` (pool) might get a different connection.
    // Safe for READ usually (Read Committed), but if we want to fetch current status...
    // Let's assume passed data has necessary info or we just update.
    
    const fields = [];
    const values = [];

    if (data.status) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.userId) {
      fields.push('user_id = ?');
      values.push(data.userId);
    }
    if (data.tenantId) {
      fields.push('user_id = ?');
      values.push(data.tenantId);
    }
    if (data.notes) {
      fields.push('notes = ?');
      values.push(data.notes);
    }
    if (data.lastContactedAt) {
      fields.push('last_contacted_at = ?');
      values.push(data.lastContactedAt);
    }

    if (fields.length === 0) return true;

    values.push(id);
    const [result] = await dbConn.query(
      `UPDATE leads SET ${fields.join(', ')} WHERE lead_id = ?`,
      values
    );
     
    // History logging (skipping connection for now or use same)
    // leadStageHistory create uses db. 
    // Ideally pass connection there too.
    
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
                    l.move_in_date as moveInDate,
                    l.occupants_count as occupantsCount,
                    l.status,
                    l.created_at as createdAt,
                    l.last_contacted_at as lastContactedAt,
                    l.user_id as userId
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
                status,
                created_at as createdAt,
                last_contacted_at as lastContactedAt,
                user_id as userId
            FROM leads ORDER BY created_at DESC`);
    return rows;
  }
  async findIdByEmailAndProperty(email, propertyId) {
    const [rows] = await db.query(
      `SELECT lead_id FROM leads WHERE email = ? AND property_id = ? LIMIT 1`,
      [email, propertyId]
    );
    return rows.length > 0 ? rows[0].lead_id : null;
  }

  async dropLeadsForUnit(unitId, connection = null) {
    const dbConn = connection || db;
    await dbConn.query(
      `UPDATE leads 
             SET status = 'dropped', notes = CONCAT(COALESCE(notes, ''), ' [System: Unit Leased]') 
             WHERE unit_id = ? AND status = 'interested'`,
      [unitId]
    );
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
        move_in_date as moveInDate,
        occupants_count as occupantsCount,
        status,
        created_at as createdAt,
        last_contacted_at as lastContactedAt,
        user_id as userId
       FROM leads WHERE email = ? AND status != 'dropped' ORDER BY created_at DESC LIMIT 1`,
      [email]
    );
    return rows[0];
  }
}

export default new LeadModel();
