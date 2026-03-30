import db from '../config/db.js';

class AuditController {
  async getLogs(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 50;
      
      const [rows] = await db.query(
        `SELECT 
          sal.log_id as id, 
          sal.user_id as userId, 
          sal.action_type as actionType, 
          sal.entity_id as entityId, 
          sal.details, 
          sal.ip_address as ipAddress, 
          sal.created_at as createdAt,
          u.name as userName
         FROM system_audit_logs sal
         LEFT JOIN users u ON sal.user_id = u.user_id
         ORDER BY sal.created_at DESC 
         LIMIT ?`,
        [limit]
      );
      
      // Parse details if they are strings
      const formattedLogs = rows.map(log => ({
        ...log,
        details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details
      }));
      
      res.json(formattedLogs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
}

export default new AuditController();
