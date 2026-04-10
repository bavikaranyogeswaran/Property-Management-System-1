import pool from '../config/db.js';

class AuditLogger {
  /**
   * Log a system action
   * @param {Object} params
   * @param {number|null} params.userId - User performing action (null for system)
   * @param {string} params.actionType - Action Code (e.g., PAYMENT_REJECTION)
   * @param {number} params.entityId - ID of related entity
   * @param {string} [params.entityType] - Type of entity (e.g., 'invoice', 'lease')
   * @param {Object|string} params.details - Details object or string
   * @param {Object} [req] - Express request object for IP
   */
  async log(
    { userId, actionType, entityId, entityType = null, details },
    req = null,
    connection = null
  ) {
    try {
      // C27 Resolve: Enforce entity_type discriminator for programmatic lookups
      if (entityId && !entityType) {
        console.warn(
          `[AUDIT WARNING] Entity ID ${entityId} provided for action ${actionType} without entityType discriminator.`
        );
      }

      const ipAddress =
        req && req.headers
          ? req.headers['x-forwarded-for'] ||
            (req.socket && req.socket.remoteAddress) ||
            'UNKNOWN'
          : 'SYSTEM';

      // C27 Resolve: Enforce valid JSON structure for details column
      const detailsStr =
        typeof details === 'object'
          ? JSON.stringify(details)
          : JSON.stringify({ message: details });

      const db = connection || pool;
      await db.query(
        `INSERT INTO system_audit_logs (user_id, action_type, entity_id, entity_type, details, ip_address) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, actionType, entityId, entityType, detailsStr, ipAddress]
      );
      console.log(`[AUDIT] ${actionType} logged.`);
    } catch (error) {
      console.error('[AUDIT ERROR]', error);
    }
  }
}

export default new AuditLogger();
