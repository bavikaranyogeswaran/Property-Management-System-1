import db from '../config/db.js';

class LeadFollowupModel {
  async create(data, connection = null) {
    const dbConn = connection || db;
    const { leadId, followupDate, notes } = data;

    const [result] = await dbConn.query(
      `INSERT INTO lead_followups (lead_id, followup_date, notes) VALUES (?, ?, ?)`,
      [leadId, followupDate, notes]
    );

    return result.insertId;
  }

  async findByLeadId(leadId) {
    const [rows] = await db.query(
      `SELECT followup_id as id, lead_id as leadId, followup_date as followupDate, notes 
       FROM lead_followups 
       WHERE lead_id = ? 
       ORDER BY followup_date DESC`,
      [leadId]
    );
    return rows;
  }

  async findUpcoming(ownerId) {
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

  async delete(id) {
    const [result] = await db.query(
      'DELETE FROM lead_followups WHERE followup_id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default new LeadFollowupModel();
