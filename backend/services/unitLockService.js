import pool from '../config/db.js';

class UnitLockService {
  /**
   * Attempt to acquire a lock for a unit in the database.
   * @param {string|number} unitId 
   * @param {string|number} leadId 
   * @returns {Promise<boolean>} True if lock acquired or already held by this lead
   */
  async acquireLock(unitId, leadId) {
    const id = parseInt(unitId);
    const lid = parseInt(leadId);
    const now = new Date();
    const expiry = new Date(now.getTime() + 10 * 60 * 1000); // 10 minute lock

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Clean up expired locks for THIS unit first or check existing
      // Using FOR UPDATE ensures that if another process is also trying to lock this unit,
      // it will wait until our transaction finishes (atomicity).
      const [existing] = await connection.query(
        "SELECT * FROM unit_locks WHERE unit_id = ? FOR UPDATE",
        [id]
      );

      if (existing.length > 0) {
        const lock = existing[0];
        const isExpired = new Date(lock.expires_at) <= now;

        if (!isExpired) {
          // If locked by someone else, fail
          if (parseInt(lock.lead_id) !== lid) {
            await connection.rollback();
            return false;
          }
          // If locked by same lead, refresh expiry below
        }
      }

      // 2. Upsert lock (using REPLACE for simplicity in MySQL, or delete then insert)
      // Since unit_id is PK, we can just replace.
      await connection.query(
        "REPLACE INTO unit_locks (unit_id, lead_id, expires_at) VALUES (?, ?, ?)",
        [id, lid, expiry]
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      console.error("UnitLockService Error:", error);
      return false;
    } finally {
      connection.release();
    }
  }

  /**
   * Check if a unit is locked by someone ELSE in the database.
   */
  async isLocked(unitId, excludeLeadId = null) {
    const [rows] = await pool.query(
      "SELECT * FROM unit_locks WHERE unit_id = ? AND expires_at > NOW()",
      [unitId]
    );

    if (rows.length > 0) {
      const lock = rows[0];
      if (!excludeLeadId || parseInt(lock.lead_id) !== parseInt(excludeLeadId)) {
        return { leadId: lock.lead_id, expiresAt: lock.expires_at };
      }
    }
    return null;
  }

  /**
   * Manually release a lock.
   */
  async releaseLock(unitId) {
    await pool.query("DELETE FROM unit_locks WHERE unit_id = ?", [unitId]);
  }

  /**
   * Background cleanup of all expired locks.
   */
  async autoCleanup() {
    try {
      await pool.query("DELETE FROM unit_locks WHERE expires_at <= NOW()");
    } catch (err) {
      console.error("Lock Cleanup Failed:", err);
    }
  }
}

// Singleton instance
const unitLockService = new UnitLockService();

// Periodically clean up expired locks every 5 minutes (less aggressive as we clean on-demand too)
setInterval(() => unitLockService.autoCleanup(), 5 * 60 * 1000);

export default unitLockService;
