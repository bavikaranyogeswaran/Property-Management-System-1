// ============================================================================
//  LEAD STAGE HISTORY MODEL (The Progression Timeline)
// ============================================================================
//  Tracks a lead moving from Inquiry to Viewed to Leased.
// ============================================================================

import db from '../config/db.js';

class LeadStageHistoryModel {
  // CREATE: Records a snapshot of a status change in the lead lifecycle.
  async create(leadId, fromStatus, toStatus, notes = '', connection = null) {
    const dbConn = connection || db;
    try {
      // 1. [DATA] Persistence: Log the transition from one state to another with a timestamp
      const [result] = await dbConn.query(
        `INSERT INTO lead_stage_history 
                 (lead_id, from_status, to_status, changed_at, notes) 
                 VALUES (?, ?, ?, NOW(), ?)`,
        [leadId, fromStatus, toStatus, notes]
      );

      return result.insertId;
    } catch (error) {
      console.error('Error creating lead stage history:', error);
      throw error;
    }
  }

  // FIND BY LEAD ID: List every stage the individual has passed through.
  async findByLeadId(leadId) {
    // 1. [QUERY] Extraction: Selecting with aliasing for DTO consistency
    const [rows] = await db.query(
      `SELECT 
                history_id as id,
                lead_id as leadId,
                from_status as fromStatus,
                to_status as toStatus,
                changed_at as changedAt,
                notes
             FROM lead_stage_history 
             WHERE lead_id = ?
             ORDER BY changed_at DESC`,
      [leadId]
    );
    return rows;
  }

  // FIND ALL: System-wide audit log of all lead transitions.
  async findAll(ownerId = null) {
    // 1. [QUERY] Filtered Join for Owners: Isolates history records to properties they manage
    if (ownerId) {
      const [rows] = await db.query(
        `SELECT 
                    h.history_id as id,
                    h.lead_id as leadId,
                    h.from_status as fromStatus,
                    h.to_status as toStatus,
                    h.changed_at as changedAt,
                    h.notes
                 FROM lead_stage_history h
                 INNER JOIN leads l ON h.lead_id = l.lead_id
                 INNER JOIN properties p ON l.property_id = p.property_id
                 WHERE p.owner_id = ?
                 ORDER BY h.changed_at DESC`,
        [ownerId]
      );
      return rows;
    }

    // 2. [QUERY] Global Retrieval for Admins
    const [rows] = await db.query(
      `SELECT 
                history_id as id,
                lead_id as leadId,
                from_status as fromStatus,
                to_status as toStatus,
                changed_at as changedAt,
                notes
             FROM lead_stage_history 
             ORDER BY changed_at DESC`
    );
    return rows;
  }
}

export default new LeadStageHistoryModel();
