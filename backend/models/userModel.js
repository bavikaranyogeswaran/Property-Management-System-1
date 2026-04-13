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
  async findByEmail(email, connection = null) {
    const db = connection || pool;
    const normalizedEmail = email ? email.toLowerCase().trim() : null;
    const [rows] = await db.query(
      'SELECT user_id as id, name, email, phone, role, password_hash as passwordHash, is_email_verified as isEmailVerified, status, token_version as tokenVersion, created_at as createdAt FROM users WHERE email = ? AND is_archived = FALSE',
      [normalizedEmail]
    );
    return rows[0];
  }

  async findByRole(role) {
    // Exclude inactive/deleted users?
    // The user wants to see "active" and "inactive", but maybe not "deleted" (which are soft deleted with status 'inactive' AND email renamed).
    // Actually, soft delete logic sets status='inactive' and email='deleted_...'.
    // If we just show all users with role=?, we clearly see them.
    // But usually we don't want to show soft-deleted users.
    // Let's assume soft-deleted users are identified by 'deleted_' prefix in email or we rely on status.
    // But regular inactive users are also 'inactive'.
    // Let's filter out those with 'deleted_%' email pattern if possible, or just return all and let service filter.
    // Better: The requirement was "owner remove a treasurer... email must be able to be used again".
    // The soft delete implementation renames the email.
    // So we should probably exclude users where email LIKE 'deleted_%'.

    const [rows] = await pool.query(
      'SELECT user_id as id, name, email, phone, role, status, created_at as createdAt FROM users WHERE role = ? AND is_archived = FALSE',
      [role]
    );
    return rows.map((row) => ({
      ...row,
      id: row.id.toString(),
    }));
  }

  async findTenantsByOwner(ownerId) {
    // Get tenants who have leases on this owner's properties
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

  async findTenantsByTreasurer(treasurerId) {
    // Get tenants relevant to this treasurer's assigned properties
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

  async findById(id, connection = null) {
    const db = connection || pool;
    const query = `
            SELECT u.user_id as id, u.name, u.email, u.phone, u.role, u.status, u.token_version as tokenVersion, u.created_at as createdAt,
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

  //  CREATE USER: Making a new file for a person.
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

    const normalizedEmail = email ? email.toLowerCase().trim() : null;

    // Use provided connection or default pool (for non-transactional calls)
    const db = connection || pool;

    try {
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
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Email address is already in use.');
      }
      throw error;
    }
  }

  async countByRole(role) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE role = ?',
      [role]
    );
    return rows[0].count;
  }

  async update(id, updateData, connection = null) {
    const db = connection || pool;
    const { name, email, phone, status } = updateData;
    const normalizedEmail = email ? email.toLowerCase().trim() : null;

    // [HARDENED] Invalidate cache before sync
    await cacheService.invalidate(cacheService.getUserKey(id));

    const [result] = await db.query(
      'UPDATE users SET name = ?, email = ?, phone = ?, status = ?, token_version = CASE WHEN status != ? THEN token_version + 1 ELSE token_version END WHERE user_id = ? AND is_archived = FALSE',
      [name, normalizedEmail, phone, status, status, id]
    );
    return result.affectedRows > 0;
  }

  async updatePassword(id, passwordHash, connection = null) {
    const db = connection || pool;

    // [HARDENED] Invalidate cache
    await cacheService.invalidate(cacheService.getUserKey(id));

    // [HARDENED] Increment token_version on password change to invalidate other sessions
    const [result] = await db.query(
      'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE user_id = ?',
      [passwordHash, id]
    );
    return result.affectedRows > 0;
  }

  async updateRole(id, role, connection = null) {
    const db = connection || pool;

    // [HARDENED] Invalidate cache
    await cacheService.invalidate(cacheService.getUserKey(id));

    const [result] = await db.query(
      'UPDATE users SET role = ? WHERE user_id = ?',
      [role, id]
    );
    return result.affectedRows > 0;
  }

  async delete(id, connection = null) {
    const db = connection || pool;
    // Soft delete to preserve financial history and audit trail
    const user = await this.findById(id);
    if (!user) return false;

    // Archive email to allow reusing the same email for new registrations
    const archivedEmail = `deleted_${id}_${Date.now()}_${user.email}`.substring(
      0,
      100
    );

    // [HARDENED] Invalidate cache
    await cacheService.invalidate(cacheService.getUserKey(id));

    const [result] = await db.query(
      'UPDATE users SET archived_at = NOW(), is_archived = TRUE, email = ?, status = ?, name = CONCAT(name, " (Deleted)"), token_version = token_version + 1 WHERE user_id = ?',
      [archivedEmail, 'inactive', id]
    );
    return result.affectedRows > 0;
  }
  async verifyEmail(id, connection = null) {
    const db = connection || pool;

    // [HARDENED] Invalidate cache
    await cacheService.invalidate(cacheService.getUserKey(id));

    const [result] = await db.query(
      'UPDATE users SET is_email_verified = TRUE, email_verified_at = NOW(), status = "active" WHERE user_id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  async setupPassword(id, passwordHash, connection = null) {
    const db = connection || pool;

    // [HARDENED] Invalidate cache
    await cacheService.invalidate(cacheService.getUserKey(id));

    // [HARDENED] Reset token_version on setup to ensure a clean state
    const [result] = await db.query(
      'UPDATE users SET password_hash = ?, is_email_verified = TRUE, email_verified_at = NOW(), status = "active", token_version = 1 WHERE user_id = ?',
      [passwordHash, id]
    );
    return result.affectedRows > 0;
  }

  async incrementTokenVersion(id, connection = null) {
    const db = connection || pool;

    // [HARDENED] Invalidate cache
    await cacheService.invalidate(cacheService.getUserKey(id));

    const [result] = await db.query(
      'UPDATE users SET token_version = token_version + 1 WHERE user_id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default new UserModel();
