import pool from '../config/db.js';

class AuditLogger {
  /**
   * Log a system action
   * @param {Object} params
   * @param {number|null} params.userId - User performing action (null for system)
   * @param {string} params.actionType - Action Code (e.g., PAYMENT_REJECTION)
   * @param {number} params.entityId - ID of related entity
   * @param {Object|string} params.details - Details object or string
   * @param {Object} [req] - Express request object for IP
   */
  async log(
    { userId, actionType, entityId, details },
    req = null,
    connection = null
  ) {
    try {
      const ipAddress = req
        ? req.headers['x-forwarded-for'] || req.socket.remoteAddress
        : 'SYSTEM';
      const detailsStr =
        typeof details === 'object' ? JSON.stringify(details) : details;

      const db = connection || pool;
      await db.query(
        `INSERT INTO system_audit_logs (user_id, action_type, entity_id, details, ip_address) 
                 VALUES (?, ?, ?, ?, ?)`,
        [userId, actionType, entityId, detailsStr, ipAddress]
      );
      console.log(`[AUDIT] ${actionType} logged.`);
    } catch (error) {
      console.error('[AUDIT ERROR]', error);
    }
  }
}

export default new AuditLogger();
