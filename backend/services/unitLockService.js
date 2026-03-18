class UnitLockService {
  constructor() {
    // Map<unitId, { leadId, expiresAt }>
    this.locks = new Map();
    
    // Periodically clean up expired locks every minute
    setInterval(() => this.autoCleanup(), 60 * 1000);
  }

  /**
   * Attempt to acquire a lock for a unit.
   * @param {string|number} unitId 
   * @param {string|number} leadId 
   * @returns {boolean} True if lock acquired or already held by this lead
   */
  acquireLock(unitId, leadId) {
    const id = unitId.toString();
    const existing = this.locks.get(id);

    if (existing && existing.expiresAt > Date.now()) {
      // If locked by someone else, fail
      if (existing.leadId.toString() !== leadId.toString()) {
        return false;
      }
      // If locked by same lead, just refresh expiry
    }

    this.locks.set(id, {
      leadId: leadId.toString(),
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minute lock
    });
    return true;
  }

  /**
   * Check if a unit is locked by someone ELSE.
   * @param {string|number} unitId 
   * @param {string|number} excludeLeadId 
   * @returns {Object|null} The lock info if locked, else null
   */
  isLocked(unitId, excludeLeadId = null) {
    const id = unitId.toString();
    const existing = this.locks.get(id);

    if (existing && existing.expiresAt > Date.now()) {
      if (!excludeLeadId || existing.leadId.toString() !== excludeLeadId.toString()) {
        return existing;
      }
    }
    return null;
  }

  /**
   * Manually release a lock.
   * @param {string|number} unitId 
   */
  releaseLock(unitId) {
    this.locks.delete(unitId.toString());
  }

  autoCleanup() {
    const now = Date.now();
    for (const [id, lock] of this.locks.entries()) {
      if (lock.expiresAt <= now) {
        this.locks.delete(id);
      }
    }
  }
}

// Singleton instance
export default new UnitLockService();
