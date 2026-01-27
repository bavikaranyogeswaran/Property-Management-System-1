import db from '../config/db.js';

class LeadStageHistoryModel {
    /**
     * Create a new stage history record
     * @param {number} leadId - Lead ID
     * @param {string|null} fromStatus - Previous status (null for lead creation)
     * @param {string} toStatus - New status
     * @param {string} notes - Optional notes about the transition
     */
    async create(leadId, fromStatus, toStatus, notes = '') {
        try {
            // Calculate duration in previous stage if there was a previous stage
            let durationInPreviousStage = null;

            if (fromStatus !== null) {
                // Find the most recent history entry for this lead
                const [previousHistory] = await db.query(
                    `SELECT changed_at FROM lead_stage_history 
                     WHERE lead_id = ? 
                     ORDER BY changed_at DESC 
                     LIMIT 1`,
                    [leadId]
                );

                if (previousHistory.length > 0) {
                    const previousDate = new Date(previousHistory[0].changed_at);
                    const now = new Date();
                    const diffTime = Math.abs(now - previousDate);
                    durationInPreviousStage = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Convert to days
                }
            }

            const [result] = await db.query(
                `INSERT INTO lead_stage_history 
                 (lead_id, from_status, to_status, changed_at, notes, duration_in_previous_stage) 
                 VALUES (?, ?, ?, NOW(), ?, ?)`,
                [leadId, fromStatus, toStatus, notes, durationInPreviousStage]
            );

            return result.insertId;
        } catch (error) {
            console.error('Error creating lead stage history:', error);
            throw error;
        }
    }

    /**
     * Get all stage history for a specific lead
     * @param {number} leadId - Lead ID
     */
    async findByLeadId(leadId) {
        const [rows] = await db.query(
            `SELECT 
                history_id as id,
                lead_id as leadId,
                from_status as fromStatus,
                to_status as toStatus,
                changed_at as changedAt,
                notes,
                duration_in_previous_stage as durationInPreviousStage
             FROM lead_stage_history 
             WHERE lead_id = ?
             ORDER BY changed_at DESC`,
            [leadId]
        );
        return rows;
    }

    /**
     * Get all stage history records
     */
    async findAll() {
        const [rows] = await db.query(
            `SELECT 
                history_id as id,
                lead_id as leadId,
                from_status as fromStatus,
                to_status as toStatus,
                changed_at as changedAt,
                notes,
                duration_in_previous_stage as durationInPreviousStage
             FROM lead_stage_history 
             ORDER BY changed_at DESC`
        );
        return rows;
    }
}

export default new LeadStageHistoryModel();
