// ============================================================================
//  USER SERVICE (The Staff & Tenant Manager)
// ============================================================================
//  This service handles the core logic for managing people in the system.
//  It deals with onboarding staff (Treasurers), managing tenant profiles,
//  and converting leads (potential tenants) into active tenants with leases.
// ============================================================================

import bcrypt from 'bcryptjs';
import userModel from '../models/userModel.js';
import leadModel from '../models/leadModel.js';
import tenantModel from '../models/tenantModel.js';
import ownerModel from '../models/ownerModel.js';
import staffModel from '../models/staffModel.js';
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import leaseService from '../services/leaseService.js';
import emailService from '../utils/emailService.js';
import leaseTermModel from '../models/leaseTermModel.js';
import securityTokenService from '../services/securityTokenService.js';
import {
  getLocalTime,
  parseLocalDate,
  addMonths,
  today,
} from '../utils/dateUtils.js';
import pool from '../config/db.js';
import unitLockService from '../services/unitLockService.js';
import leadTokenModel from '../models/leadTokenModel.js';
import leadStageHistoryModel from '../models/leadStageHistoryModel.js';
import { toCentsFromMajor, fromCents } from '../utils/moneyUtils.js';
import auditLogger from '../utils/auditLogger.js';
import { ROLES } from '../utils/roleUtils.js';

const SALT_ROUNDS = 10;

class UserService {
  // CREATE TREASURER: Handles onboarding for a new staff member.
  async createTreasurer(
    name,
    email,
    phone,
    password,
    staffData = {},
    user = null
  ) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. [SECURITY] Email Uniqueness Guard
      const existingUser = await userModel.findByEmail(email, connection);
      if (existingUser) throw new Error('Email already in use');

      // 2. Hash password (or generate temp one)
      const tempPassword = password || Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, SALT_ROUNDS);

      // 3. Create core User account
      const userId = await userModel.create(
        {
          name,
          email,
          phone,
          passwordHash: hashedPassword,
          role: ROLES.TREASURER,
          status: 'active',
        },
        connection
      );

      // 4. Create specialized Staff Profile
      await staffModel.create({ userId, ...staffData }, connection);

      // 5. [AUDIT] Log the staff creation
      await auditLogger.log(
        {
          userId: user?.id || null,
          actionType: 'STAFF_ACCOUNT_CREATED',
          entityId: userId,
          entityType: 'user',
          details: { name, email, role: ROLES.TREASURER },
        },
        null,
        connection
      );

      await connection.commit();

      // 6. [SIDE EFFECT] Generate setup token and send invitation email
      const token = await securityTokenService.createToken(
        userId,
        'setup',
        172800,
        { role: ROLES.TREASURER }
      );
      await emailService.sendInvitationEmail(email, ROLES.TREASURER, token);

      return { id: userId, name, email, phone, role: ROLES.TREASURER };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // UPDATE TREASURER: Saves changes to a staff member's basic info.
  async updateTreasurer(id, data) {
    const { name, email, phone, status } = data;

    // 1. [SECURITY] Email Uniqueness validation for updates
    const existingUser = await userModel.findByEmail(email);
    if (existingUser && existingUser.id !== parseInt(id))
      throw new Error('Email already in use');

    // 2. Perform user record update
    const updated = await userModel.update(id, { name, email, phone, status });
    if (!updated) throw new Error('User not found or update failed');

    return { id, name, email, phone, status };
  }

  // UPDATE USER PROFILE: Unified portal for self-service profile management.
  async updateUserProfile(id, data) {
    const {
      name,
      phone,
      emergencyContactName,
      emergencyContactPhone,
      employmentStatus,
      permanentAddress,
    } = data;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Fetch current profile state
      const currentUser = await userModel.findById(id, connection);
      if (!currentUser) throw new Error('User not found');

      // 2. Update core Users table
      const usersUpdated = await userModel.update(
        id,
        { name, phone, email: currentUser.email, status: currentUser.status },
        connection
      );
      if (!usersUpdated) throw new Error('Profile update failed');

      // 3. [SIDE EFFECT] Update specialized Tenant Profile if applicable
      if (currentUser.role === ROLES.TENANT) {
        await tenantModel.update(
          id,
          {
            emergencyContactName,
            emergencyContactPhone,
            employmentStatus,
            permanentAddress,
          },
          connection
        );
      }

      // 4. [AUDIT] Log the self-service update
      try {
        await auditLogger.log(
          {
            userId: id,
            actionType: 'PROFILE_UPDATED',
            entityId: id,
            entityType: 'user',
            details: { name, phone },
          },
          null,
          connection
        );
      } catch (err) {
        console.error('Profile audit failed:', err);
      }

      await connection.commit();
      return {
        id,
        name,
        email: currentUser.email,
        phone,
        role: currentUser.role,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteTreasurer(id) {
    const deleted = await userModel.delete(id);
    if (!deleted) throw new Error('User not found or delete failed');
    return { message: 'Treasurer deleted successfully' };
  }

  async getTreasurers() {
    return await userModel.findByRole(ROLES.TREASURER);
  }

  async getTenants(ownerId = null, treasurerId = null) {
    if (ownerId) return await userModel.findTenantsByOwner(ownerId);
    if (treasurerId) return await userModel.findTenantsByTreasurer(treasurerId);
    return await userModel.findByRole(ROLES.TENANT);
  }

  async getOwners() {
    return await userModel.findByRole(ROLES.OWNER);
  }

  async getUserById(id) {
    const user = await userModel.findById(id);
    if (user) delete user.password_hash;
    return user;
  }

  // Convert lead to tenant
  // CONVERT LEAD TO TENANT: Finalizes conversion from lead/applicant to formal tenant with a draft lease.
  async convertLeadToTenant(
    leadId,
    startDate,
    endDate,
    tenantData = {},
    user = null
  ) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Fetch lead and handle Idempotency
      const lead = await leadModel.findById(leadId, connection);
      if (!lead) throw new Error('Lead not found');

      if (lead.status === 'converted') {
        const existingUser = await userModel.findByEmail(
          lead.email,
          connection
        );
        return {
          message: 'Lead already converted',
          tenantId: existingUser?.id,
          alreadyConverted: true,
          magicLinkSent: true,
        };
      }

      // 2. [CONCURRENCY] Acquire Unit Lock to prevent parallel conversions for same room
      const targetUnitId = tenantData.unitId || lead.interestedUnit;
      if (targetUnitId) {
        const lockAcquired = await unitLockService.acquireLock(
          targetUnitId,
          leadId
        );
        if (!lockAcquired)
          throw new Error(
            'Unit currently being processed by another staff member.'
          );
      }

      // 3. User Resolution: Find existing account or create new Tenant account
      let userId;
      const existingUser = await userModel.findByEmail(lead.email, connection);
      let invitationToken = null;

      if (existingUser) {
        if (existingUser.role !== ROLES.TENANT)
          throw new Error(`Email taken by ${existingUser.role} account.`);
        userId = existingUser.id;
      } else {
        const hashedPassword = await bcrypt.hash(
          Math.random().toString(36).slice(-8),
          SALT_ROUNDS
        );
        userId = await userModel.create(
          {
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            passwordHash: hashedPassword,
            role: ROLES.TENANT,
            status: 'active',
          },
          connection
        );
        // Generate security token for first-time account setup
        invitationToken = await securityTokenService.createToken(
          userId,
          'setup',
          172800,
          { role: ROLES.TENANT }
        );
      }

      // 4. Create specialized Tenant Profile
      const existingTenant = await tenantModel.findByUserId(userId, connection);
      if (!existingTenant) {
        await tenantModel.create(
          {
            userId,
            nic: tenantData.nic,
            permanentAddress: tenantData.permanentAddress,
            emergencyContactName: tenantData.emergencyContactName,
            emergencyContactPhone: tenantData.emergencyContactPhone,
            employmentStatus: 'Employed',
            monthlyIncome: Number(tenantData.monthlyIncome || 0),
          },
          connection
        );
      }

      // 5. Update Lead metrics and stage history
      await connection.query('UPDATE leads SET status = ? WHERE lead_id = ?', [
        'converted',
        leadId,
      ]);
      await leadTokenModel.invalidateForLead(leadId, connection);
      await connection.query(
        'UPDATE messages SET tenant_id = ? WHERE lead_id = ?',
        [userId, leadId]
      );
      await leadStageHistoryModel.create(
        leadId,
        lead.status,
        'converted',
        'System: Formal conversion to active tenant.',
        connection
      );

      // 6. [SIDE EFFECT] Auto-drop other interested applicants for this specific unit
      if (targetUnitId) {
        const [otherLeads] = await connection.query(
          "SELECT lead_id, status FROM leads WHERE unit_id = ? AND lead_id != ? AND status NOT IN ('converted', 'dropped')",
          [targetUnitId, leadId]
        );
        for (const o of otherLeads) {
          await connection.query(
            "UPDATE leads SET status = 'dropped' WHERE lead_id = ?",
            [o.lead_id]
          );
          await leadStageHistoryModel.create(
            o.lead_id,
            o.status,
            'dropped',
            'System: Unit leased to another applicant.',
            connection
          );
        }
      }

      // 7. Lease Creation: Generate the draft lease through LeaseService
      let result = {
        message: 'Lead converted',
        tenantId: userId,
        magicLinkSent: false,
      };
      if (targetUnitId) {
        const unit = await unitModel.findById(targetUnitId, connection);
        if (unit) {
          const leaseStart = startDate
            ? parseLocalDate(startDate)
            : getLocalTime();
          const leaseEnd = endDate
            ? parseLocalDate(endDate)
            : addMonths(leaseStart, 12);
          const securityDepositCents =
            tenantData.securityDeposit !== undefined
              ? toCentsFromMajor(tenantData.securityDeposit)
              : unit.monthlyRent;

          const { leaseId, magicToken } = await leaseService.createLease(
            {
              tenantId: userId,
              unitId: targetUnitId,
              startDate: leaseStart,
              endDate: leaseEnd,
              monthlyRent: unit.monthlyRent,
              targetDeposit: securityDepositCents,
              documentUrl: tenantData.documentUrl,
            },
            connection,
            user
          );

          await connection.commit(); // Transaction ends here

          // 8. [SIDE EFFECT] Deliver appropriate notification (Non-blocking)
          try {
            if (magicToken) {
              await emailService.sendDepositMagicLink(
                lead.email,
                lead.name,
                unit.propertyName,
                unit.unitNumber,
                securityDepositCents,
                magicToken
              );
            } else {
              await emailService.sendDraftLeaseNotification(
                lead.email,
                lead.name,
                unit.propertyName,
                unit.unitNumber
              );
              if (invitationToken)
                await emailService.sendInvitationEmail(
                  lead.email,
                  ROLES.TENANT,
                  invitationToken
                );
            }
            result.magicLinkSent = true;
          } catch (e) {
            console.error('Conversion email failed:', e);
          }
          result.leaseId = leaseId;
        }
      } else {
        await connection.commit();
      }

      if (targetUnitId) unitLockService.releaseLock(targetUnitId, leadId);
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // TRIGGER ONBOARDING: Sends login credentials to a tenant after their lease is ready.
  async triggerOnboarding(userId, connection = null) {
    const db = connection || pool;
    // 1. Fetch user and handle Idempotency
    const user = await userModel.findById(userId, db);
    if (!user) return null;

    if (user.isEmailVerified) return null;

    // 2. Generate security setup token
    const token = await securityTokenService.createToken(
      userId,
      'setup',
      172800,
      { role: ROLES.TENANT }
    );

    // 3. [SIDE EFFECT] Deliver onboarding email
    try {
      await emailService.sendInvitationEmail(user.email, ROLES.TENANT, token);
    } catch (err) {
      console.error('Onboarding email failed:', err);
    }

    // 4. [AUDIT] Log the onboarding trigger
    try {
      await auditLogger.log(
        {
          userId: null,
          actionType: 'TENANT_ONBOARDING_TRIGGERED',
          entityId: userId,
          entityType: 'user',
          details: { email: user.email },
        },
        null,
        db
      );
    } catch (err) {
      console.error('Onboarding audit failed:', err);
    }

    return token;
  }

  // ============================================================================
  //  STAFF MANAGEMENT
  // ============================================================================

  // RESEND INVITATION: Manually re-triggers the setup email for a user.
  async resendInvitation(userId) {
    const user = await userModel.findById(userId);
    if (!user) throw new Error('User not found');

    if (user.isEmailVerified) {
      await emailService.sendTenantConfirmation(user.email, user.name);
      return { message: `Portals instructions re-sent.` };
    }

    const token = await securityTokenService.createToken(
      userId,
      'setup',
      172800,
      { role: user.role }
    );
    await emailService.sendInvitationEmail(user.email, user.role, token);

    return { message: `Invitation re-sent.` };
  }

  // FORCE LOGOUT: Invalidate all active sessions for a user (e.g., after termination).
  async forceLogout(id, actorId, reason = null) {
    const user = await userModel.findById(id);
    if (!user) throw new Error('User not found');

    await userModel.incrementTokenVersion(id);

    await auditLogger.log({
      userId: actorId,
      actionType: 'FORCE_LOGOUT',
      entityId: id,
      entityType: 'user',
      details: { reason },
    });
    return { message: 'User sessions invalidated.' };
  }

  // ASSIGN PROPERTY: Link a Treasurer to a specific physical asset.
  async assignProperty(userId, propertyId, actorId) {
    await staffModel.assignProperty(userId, propertyId);

    await auditLogger.log({
      userId: actorId,
      actionType: 'PROPERTY_ASSIGNED_TO_STAFF',
      entityId: propertyId,
      entityType: 'property',
      details: { staffUserId: userId },
    });
    return { message: 'Property assigned successfully' };
  }

  // REMOVE PROPERTY: Revoke a Treasurer's management rights over an asset.
  async removeProperty(userId, propertyId, actorId) {
    await staffModel.removePropertyAssignment(userId, propertyId);

    await auditLogger.log({
      userId: actorId,
      actionType: 'PROPERTY_REMOVED_FROM_STAFF',
      entityId: propertyId,
      entityType: 'property',
      details: { staffUserId: userId },
    });
    return { message: 'Property assignment removed' };
  }
}

export default new UserService();
