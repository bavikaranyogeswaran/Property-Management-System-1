// ============================================================================
//  AUDIT CONTROLLER (The Historian)
// ============================================================================
//  This file exposes the system's unalterable audit logs.
//  It helps Owners and System Admins see exactly who did what and when.
// ============================================================================

import db from '../config/db.js';

class AuditController {
  // GET LOGS: Retrieves a paginated list of the most recent system actions.
  async getLogs(req, res) {
    try {
      // 1. [VALIDATION] Resolve request constraints (Default limit: 50)
      const limit = parseInt(req.query.limit) || 50;

      // 2. [DATA] Bulk Load: Join audit logs with user identities for human readability
      const [rows] = await db.query(
        `SELECT sal.log_id as id, sal.user_id as userId, sal.action_type as actionType, sal.entity_id as entityId, 
                sal.entity_type as entityType, sal.details, sal.ip_address as ipAddress, sal.created_at as createdAt,
                u.name as userName
         FROM system_audit_logs sal
         LEFT JOIN users u ON sal.user_id = u.user_id
         ORDER BY sal.created_at DESC LIMIT ?`,
        [limit]
      );

      // 3. [TRANSFORMATION] Data Sanitization: Ensure JSON details are parsed into objects
      const formattedLogs = rows.map((log) => ({
        ...log,
        details:
          typeof log.details === 'string'
            ? JSON.parse(log.details)
            : log.details,
      }));

      // 4. [RESPONSE] Dispatch the chronologically ordered activity stream
      res.json(formattedLogs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
}

export default new AuditController();
