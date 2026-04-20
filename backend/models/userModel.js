// ============================================================================
//  USER MODEL (The Person Records)
// ============================================================================
//  This file manages the "Files" for every person in the system.
//  Whether they are an Owner, Tenant, or Treasurer, their basic info (Name, Email) lives here.
// ============================================================================

import pool from '../config/db.js';
import cacheService from '../services/cacheService.js';
import { ROLES } from '../utils/roleUtils.js';

class UserModel {
  // FIND BY EMAIL: Authenticates a user or checks for existing identity.
  async findByEmail(email, connection = null) {
    const db = connection || pool;
    // 1. [DATA] Normalization: Ensures case-insensitive lookup
    const normalizedEmail = email ? email.toLowerCase().trim() : null;
    // 2. [QUERY] Extraction: Retrieves core credentials and security tokens
    const [rows] = await db.query(
      'SELECT user_id as id, name, email, phone, role, password_hash as passwordHash, is_email_verified as isEmailVerified, status, token_version as tokenVersion, created_at as createdAt FROM users WHERE email = ? AND is_archived = FALSE',
      [normalizedEmail]
    );
    return rows[0];
  }

  // FIND BY ROLE: Lists all active individuals belonging to a specific system category (Owner, Tenant, etc).
  async findByRole(role) {
    // 1. [QUERY] Filtered Extraction: excludes archived profiles
    const [rows] = await pool.query(
      'SELECT user_id as id, name, email, phone, role, status, created_at as createdAt FROM users WHERE role = ? AND is_archived = FALSE',
      [role]
    );
    return rows.map((row) => ({
      ...row,
      id: row.id.toString(),
    }));
  }

  // FIND TENANTS BY OWNER: Resolves the customer list for an investor across their entire property portfolio.
  async findTenantsByOwner(ownerId) {
    // 1. [QUERY] Deep Join: Navigates User -> Tenant -> Lease -> Unit -> Property -> Owner
    const [rows] = await pool.query(
      `
            SELECT DISTINCT 
                u.user_id as id, 
                u.name, 
                u.email, 
                u.phone, 
                u.role, 
                u.status, 
                u.created_at as createdAt,
                t.nic, 
                t.permanent_address as permanentAddress,
                t.employment_status as employmentStatus,
                t.monthly_income as monthlyIncome,
                t.behavior_score as behaviorScore,
                t.nic_url as nicUrl
            FROM users u
            JOIN tenants t ON u.user_id = t.user_id
            JOIN leases l ON u.user_id = l.tenant_id
            JOIN units ut ON l.unit_id = ut.unit_id
            JOIN properties p ON ut.property_id = p.property_id

            WHERE u.role = ?
                AND p.owner_id = ?
                AND u.is_archived = FALSE
            ORDER BY u.created_at DESC
        `,
      [ROLES.TENANT, ownerId]
    );
    return rows.map((row) => ({
      ...row,
      id: row.id.toString(),
    }));
  }

  // FIND TENANTS BY TREASURER: Limits visibility to residents in buildings assigned to the staff member.
  async findTenantsByTreasurer(treasurerId) {
    // 1. [QUERY] RBAC Filtered Join: Filters via staff-property assignment table
    const [rows] = await pool.query(
      `
            SELECT DISTINCT 
                u.user_id as id, 
                u.name, 
                u.email, 
                u.phone, 
                u.role, 
                u.status, 
                u.created_at as createdAt,
                t.nic, 
                t.permanent_address as permanentAddress,
                t.employment_status as employmentStatus,
                t.monthly_income as monthlyIncome,
                t.behavior_score as behaviorScore,
                t.nic_url as nicUrl
            FROM users u
            JOIN tenants t ON u.user_id = t.user_id
            -- Join path 1: via Leases for Assigned Properties
            JOIN leases l ON u.user_id = l.tenant_id
            JOIN units ut ON l.unit_id = ut.unit_id
            
            -- Filter by Assignment
            JOIN staff_property_assignments spa ON spa.user_id = ?
            
            WHERE u.role = ?
                AND ut.property_id = spa.property_id
                AND l.status != 'cancelled'
                AND u.is_archived = FALSE
            ORDER BY u.created_at DESC
        `,
      [treasurerId, ROLES.TENANT]
    );
    return rows.map((row) => ({
      ...row,
      id: row.id.toString(),
    }));
  }

  // FIND BY ID: Hydrates a complex composite profile (User + Tenant/Owner/Staff metadata).
  async findById(id, connection = null) {
    const db = connection || pool;
    // 1. [QUERY] Massive Multi-Role Join: Resolves identity fragments from all subtype tables
    const query = `
            SELECT u.user_id as id, u.name, u.email, u.phone, u.role, u.status, u.is_email_verified as isEmailVerified, u.token_version as tokenVersion, u.created_at as createdAt,
                   t.nic, t.nic_url as nicUrl, t.permanent_address as permanentAddress, 
                   t.employment_status as employmentStatus, t.monthly_income as monthlyIncome, 
                   t.behavior_score as behaviorScore, t.credit_balance as creditBalance,
                   o.nic as ownerNic, o.tin, o.bank_name as bankName, o.branch_name as branchName, 
                   o.account_holder_name as accountHolderName, o.account_number as accountNumber,
                   s.employee_id as employeeId, s.job_title as jobTitle, s.shift_start as shiftStart, s.shift_end as shiftEnd
            FROM users u
            LEFT JOIN tenants t ON u.user_id = t.user_id
            LEFT JOIN owners o ON u.user_id = o.user_id
            LEFT JOIN staff s ON u.user_id = s.user_id
            WHERE u.user_id = ?
        `;
    const [rows] = await db.query(query, [id]);
    return rows[0];
  }

  // CREATE USER: Initializes the core digital identity for a person.
  async create(userData, connection) {
    const {
      name,
      email,
      phone,
      passwordHash,
      role,
      is_email_verified = false,
      status = 'active',
    } = userData;

    // 1. [DATA] Normalization
    const normalizedEmail = email ? email.toLowerCase().trim() : null;

    // Use provided connection or default pool (for non-transactional calls)
    const db = connection || pool;

    try {
      // 2. [DATA] Persistence
      const [result] = await db.query(
        'INSERT INTO users (name, email, phone, password_hash, role, is_email_verified, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          name,
          normalizedEmail,
          phone,
          passwordHash,
          role,
          is_email_verified,
          status,
        ]
      );
      return result.insertId;
    } catch (error) {
      // 3. [SECURITY] Constraint Handling: prevents duplicate identity registration
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Email address is already in use.');
      }
      throw error;
    }
  }

  // COUNT BY ROLE: Aggregate statistic for dashboard reporting.
  async countByRole(role) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE role = ?',
      [role]
    );
    return rows[0].count;
  }

  // UPDATE: Modifies basic contact details and synchronizes status-based cache invalidation.
  async update(id, updateData, connection = null) {
    const db = connection || pool;
    const { name, email, phone, status } = updateData;
    const normalizedEmail = email ? email.toLowerCase().trim() : null;

    // 1. [CACHE] Invalidation: Ensures immediate visibility of profile changes across the system
    await cacheService.invalidate(cacheService.getUserKey(id));

    // 2. [DATA] Persistence + Security: Increments token_version if status changes to force re-authentication
    const [result] = await db.query(
      'UPDATE users SET name = ?, email = ?, phone = ?, status = ?, token_version = CASE WHEN status != ? THEN token_version + 1 ELSE token_version END WHERE user_id = ? AND is_archived = FALSE',
      [name, normalizedEmail, phone, status, status, id]
    );
    return result.affectedRows > 0;
  }

  // UPDATE PASSWORD: Securely rotates credentials and invalidates all active sessions.
  async updatePassword(id, passwordHash, connection = null) {
    const db = connection || pool;

    // 1. [CACHE] Invalidation
    await cacheService.invalidate(cacheService.getUserKey(id));

    // 2. [DATA] Persistence + Global Session Invalidation via token_version bump
    const [result] = await db.query(
      'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE user_id = ?',
      [passwordHash, id]
    );
    return result.affectedRows > 0;
  }

  // UPDATE ROLE: Modifies the person's authorization level.
  async updateRole(id, role, connection = null) {
    const db = connection || pool;

    // 1. [CACHE] Invalidation
    await cacheService.invalidate(cacheService.getUserKey(id));

    // 2. [DATA] Persistence
    const [result] = await db.query(
      'UPDATE users SET role = ? WHERE user_id = ?',
      [role, id]
    );
    return result.affectedRows > 0;
  }

  // DELETE: Soft-archives a user profile, renaming the email to free it for future use.
  async delete(id, connection = null) {
    const db = connection || pool;
    // 1. [QUERY] Capture current state
    const user = await this.findById(id);
    if (!user) return false;

    // 2. [DATA] Anonymization: Prepare unique archived email format
    const archivedEmail = `deleted_${id}_${Date.now()}_${user.email}`.substring(
      0,
      100
    );

    // 3. [CACHE] Invalidation
    await cacheService.invalidate(cacheService.getUserKey(id));

    // 4. [DATA] Archival: Marks as hidden and bumps token_version to boot user from all devices
    const [result] = await db.query(
      'UPDATE users SET archived_at = NOW(), is_archived = TRUE, email = ?, status = ?, name = CONCAT(name, " (Deleted)"), token_version = token_version + 1 WHERE user_id = ?',
      [archivedEmail, 'inactive', id]
    );
    return result.affectedRows > 0;
  }

  // VERIFY EMAIL: Flags the identity as confirmed via a verification event.
  async verifyEmail(id, connection = null) {
    const db = connection || pool;

    // 1. [CACHE] Invalidation
    await cacheService.invalidate(cacheService.getUserKey(id));

    // 2. [DATA] Progress Update
    const [result] = await db.query(
      'UPDATE users SET is_email_verified = TRUE, email_verified_at = NOW(), status = "active" WHERE user_id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  // SETUP PASSWORD: Initial credential setting for invited users.
  async setupPassword(id, passwordHash, connection = null) {
    const db = connection || pool;

    // 1. [CACHE] Invalidation
    await cacheService.invalidate(cacheService.getUserKey(id));

    // 2. [DATA] Persistence + Activation
    const [result] = await db.query(
      'UPDATE users SET password_hash = ?, is_email_verified = TRUE, email_verified_at = NOW(), status = "active", token_version = 1 WHERE user_id = ?',
      [passwordHash, id]
    );
    return result.affectedRows > 0;
  }

  // INCREMENT TOKEN VERSION: Manual trigger to force re-authentication (e.g., security breach).
  async incrementTokenVersion(id, connection = null) {
    const db = connection || pool;

    // 1. [CACHE] Invalidation
    await cacheService.invalidate(cacheService.getUserKey(id));

    // 2. [DATA] Session Revocation
    const [result] = await db.query(
      'UPDATE users SET token_version = token_version + 1 WHERE user_id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default new UserModel();
