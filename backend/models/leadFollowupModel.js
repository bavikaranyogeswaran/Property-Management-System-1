// ============================================================================
//  LEAD FOLLOW-UP MODEL (The Prospect Diary)
// ============================================================================
//  Records staff communications like text messages and calls with prospects.
// ============================================================================

import db from '../config/db.js';

class LeadFollowupModel {
  // CREATE: Records a new touchpoint instance with a prospective tenant.
  async create(data, connection = null) {
    const dbConn = connection || db;
    const { leadId, followupDate, notes } = data;

    // 1. [DATA] Persistence
    const [result] = await dbConn.query(
      `INSERT INTO lead_followups (lead_id, followup_date, notes) VALUES (?, ?, ?)`,
      [leadId, followupDate, notes]
    );

    return result.insertId;
  }

  // FIND BY LEAD ID: Retrieves the chronological diary for a specific individual.
  async findByLeadId(leadId) {
    // 1. [QUERY] Extraction: Selecting with aliasing for DTO consistency
    const [rows] = await db.query(
      `SELECT followup_id as id, lead_id as leadId, followup_date as followupDate, notes 
       FROM lead_followups 
       WHERE lead_id = ? 
       ORDER BY followup_date DESC`,
      [leadId]
    );
    return rows;
  }

  // FIND UPCOMING: Lists future scheduled appointments for an Owner's entire portfolio.
  async findUpcoming(ownerId) {
    // 1. [QUERY] Filtered Join: Only show future entries for properties belonging to this specific Owner
    const [rows] = await db.query(
      `SELECT lf.followup_id as id, lf.lead_id as leadId, lf.followup_date as followupDate, lf.notes, l.name as leadName
       FROM lead_followups lf
       INNER JOIN leads l ON lf.lead_id = l.lead_id
       INNER JOIN properties p ON l.property_id = p.property_id
       WHERE p.owner_id = ? AND lf.followup_date >= CURDATE()
       ORDER BY lf.followup_date ASC`,
      [ownerId]
    );
    return rows;
  }

  // DELETE: Removes a diary entry (permanent purge).
  async delete(id) {
    // 1. [DATA] Purge Logic
    const [result] = await db.query(
      'DELETE FROM lead_followups WHERE followup_id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default new LeadFollowupModel();
