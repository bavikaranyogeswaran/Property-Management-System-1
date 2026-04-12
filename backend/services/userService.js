import bcrypt from 'bcryptjs';
const { hash } = bcrypt;
import userModel from '../models/userModel.js';
import leadModel from '../models/leadModel.js';
import tenantModel from '../models/tenantModel.js';
import ownerModel from '../models/ownerModel.js';
import staffModel from '../models/staffModel.js';
import jwt from 'jsonwebtoken';
const { sign } = jwt;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET)
  throw new Error('FATAL: JWT_SECRET is not set in the environment variables.');
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import leaseService from '../services/leaseService.js';
import emailService from '../utils/emailService.js';
import leaseTermModel from '../models/leaseTermModel.js';
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

const SALT_ROUNDS = 10;

class UserService {
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

      // Validation handled in Controller or here (DAL checks duplicate email)
      // findByEmail uses pool, so it is outside transaction?
      // Better to use connection if possible, but finding by email is just a read.
      // However, concurrent inserts might race.
      // For now, simple read is fine.
      const existingUser = await userModel.findByEmail(email, connection);
      if (existingUser) {
        throw new Error('Email already in use');
      }

      const tempPassword = password || Math.random().toString(36).slice(-8);
      const hashedPassword = await hash(tempPassword, SALT_ROUNDS);

      const userId = await userModel.create(
        {
          name,
          email,
          phone,
          passwordHash: hashedPassword,
          role: 'treasurer',
          status: 'active',
        },
        connection
      );

      // Create Staff Profile
      await staffModel.create(
        {
          userId,
          ...staffData,
        },
        connection
      );

      await auditLogger.log(
        {
          userId: user?.id || null,
          actionType: 'STAFF_ACCOUNT_CREATED',
          entityId: userId,
          entityType: 'user',
          details: { name, email, role: 'treasurer' },
        },
        null,
        connection
      );

      await connection.commit();

      // Setup Token & Email (Outside transaction as side effect)
      const token = jwt.sign(
        { id: userId, type: 'setup_password', role: 'treasurer' },
        JWT_SECRET,
        { expiresIn: '48h' }
      );
      await emailService.sendInvitationEmail(email, 'treasurer', token);

      return { id: userId, name, email, phone, role: 'treasurer' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateTreasurer(id, data) {
    const { name, email, phone, status } = data;

    // Check if email is being changed and if it's taken
    const existingUser = await userModel.findByEmail(email);
    if (existingUser && existingUser.id !== parseInt(id)) {
      throw new Error('Email already in use');
    }

    // We do NOT update password here.
    const updated = await userModel.update(id, { name, email, phone, status });
    if (!updated) {
      throw new Error('User not found or update failed');
    }

    return { id, name, email, phone, status };
  }

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

      // 1. Fetch current user from users table
      const currentUser = await userModel.findById(id, connection);
      if (!currentUser) {
        throw new Error('User not found');
      }

      // 2. Update users table (common to all roles)
      const usersUpdated = await userModel.update(
        id,
        {
          name,
          phone,
          email: currentUser.email, // Preserve email
          status: currentUser.status, // Preserve status
        },
        connection
      );

      if (!usersUpdated) {
        throw new Error('Update to users table failed');
      }

      // 3. Update tenants table if user is a tenant (E7)
      if (currentUser.role === 'tenant') {
        const tenantUpdateData = {
          emergencyContactName,
          emergencyContactPhone,
          employmentStatus,
          permanentAddress,
        };

        // tenantModel.update only updates provided fields based on its whitelist
        await tenantModel.update(id, tenantUpdateData, connection);
      }

      // 4. Log the action (Audit)
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
        console.error('Audit log failed for profile update:', err);
      }

      await connection.commit();

      // Return the updated basic user object
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
    if (!deleted) {
      throw new Error('User not found or delete failed');
    }
    return { message: 'Treasurer deleted successfully' };
  }

  async getTreasurers() {
    return await userModel.findByRole('treasurer');
  }

  async getTenants(ownerId = null, treasurerId = null) {
    if (ownerId) {
      return await userModel.findTenantsByOwner(ownerId);
    }
    if (treasurerId) {
      return await userModel.findTenantsByTreasurer(treasurerId);
    }
    return await userModel.findByRole('tenant');
  }

  async getOwners() {
    return await userModel.findByRole('owner');
  }

  async getUserById(id) {
    const user = await userModel.findById(id);
    if (user) {
      // Remove sensitive data
      delete user.password_hash;
    }
    return user;
  }

  // Convert lead to tenant
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

      // 1. Get lead details
      const lead = await leadModel.findById(leadId, connection);
      if (!lead) {
        throw new Error('Lead not found');
      }

      // IDEMPOTENCY: If lead already converted, return Success.
      if (lead.status === 'converted') {
        const existingUser = await userModel.findByEmail(
          lead.email,
          connection
        );
        let existingLeaseId = null;
        if (existingUser) {
          const [leases] = await connection.query(
            "SELECT lease_id FROM leases WHERE tenant_id = ? AND unit_id = ? AND status IN ('draft', 'active') ORDER BY created_at DESC LIMIT 1",
            [existingUser.id, targetUnitIdForLock]
          );
          if (leases.length > 0) {
            existingLeaseId = leases[0].lease_id;
          }
        }
        return {
          message: 'Lead already converted',
          tenantId: existingUser ? existingUser.id : null,
          leaseId: existingLeaseId,
          alreadyConverted: true,
          magicLinkSent: true,
        };
      }

      // LOCKING: Ensure unit is not being processed by another conversion.
      const targetUnitIdForLock = tenantData.unitId || lead.interestedUnit;
      if (targetUnitIdForLock) {
        const lockAcquired = await unitLockService.acquireLock(
          targetUnitIdForLock,
          leadId
        );
        if (!lockAcquired) {
          throw new Error(
            'This unit is currently being processed by another staff member. Please wait 10 minutes or choose another unit.'
          );
        }
      }

      // 2. Check if a user with this email already exists
      let userId;
      const existingUser = await userModel.findByEmail(lead.email, connection);

      let invitationToken = null;
      if (existingUser) {
        if (existingUser.role === 'tenant') {
          // User is already an active tenant applying for another property.
          // They already have an account and password, so we just proceed with lease creation.
          userId = existingUser.id;
          console.log(
            `Lead ${leadId} is already a tenant (User ID: ${userId}). Proceeding with new lease creation.`
          );
        } else {
          throw new Error(
            `Email ${lead.email} is already associated with a ${existingUser.role} account. Cannot convert to tenant.`
          );
        }
      } else {
        // Create new user account for the tenant
        const passwordToUse = Math.random().toString(36).slice(-8);
        const hashedPassword = await hash(passwordToUse, SALT_ROUNDS);

        userId = await userModel.create(
          {
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            passwordHash: hashedPassword,
            role: 'tenant',
            status: 'active',
          },
          connection
        );

        invitationToken = jwt.sign(
          { id: userId, type: 'setup_password', role: 'tenant' },
          JWT_SECRET,
          { expiresIn: '48h' }
        );
      }

      // Track email context data
      const mailData = {
        email: lead.email,
        name: lead.name,
        leaseId: null,
        propertyName: null,
        unitNumber: null,
        depositAmount: 0,
      };

      // 3. Create Tenant Profile
      const existingTenant = await tenantModel.findByUserId(userId, connection);
      if (!existingTenant) {
        await tenantModel.create(
          {
            userId,
            nic: tenantData.nic || null,
            permanentAddress: tenantData.permanentAddress || null,
            emergencyContactName: tenantData.emergencyContactName || null,
            emergencyContactPhone: tenantData.emergencyContactPhone || null,
            employmentStatus: 'Employed',
            monthlyIncome: toCentsFromMajor(tenantData.monthlyIncome || 0),
          },
          connection
        );
      }

      // 4. Update lead status (direct SQL to avoid duplicate history from leadModel.update)
      await connection.query('UPDATE leads SET status = ? WHERE lead_id = ?', [
        'converted',
        leadId,
      ]);

      // 4a. Invalidate portal access tokens
      await leadTokenModel.invalidateForLead(leadId, connection);

      // 4b. Migrate past conversation thread to the active tenant ID
      await connection.query(
        'UPDATE messages SET tenant_id = ? WHERE lead_id = ?',
        [userId, leadId]
      );

      await leadStageHistoryModel.create(
        leadId,
        lead.status, // fromStatus — captured before the update above
        'converted', // toStatus
        'System: Lead formally converted into an active tenant.',
        connection
      );

      // [C1.2 FIX] Auto-drop other leads for this specific unit
      if (lead.interestedUnit || tenantData.unitId) {
        const affectedUnit = tenantData.unitId || lead.interestedUnit;
        const [otherLeads] = await connection.query(
          "SELECT lead_id, status FROM leads WHERE unit_id = ? AND lead_id != ? AND status NOT IN ('converted', 'dropped')",
          [affectedUnit, leadId]
        );

        for (const otherLead of otherLeads) {
          await connection.query(
            "UPDATE leads SET status = 'dropped' WHERE lead_id = ?",
            [otherLead.lead_id]
          );
          // Log history for each dropped lead
          await leadStageHistoryModel.create(
            otherLead.lead_id,
            otherLead.status,
            'dropped',
            `System: Unit #${affectedUnit} has been leased to another applicant.`,
            connection
          );
        }
        console.log(
          `[CLEANUP] Dropped ${otherLeads.length} other leads for unit #${affectedUnit}`
        );
      }

      // 5. Lease & Unit Logic
      // Use provided unitId (from conversion dialog) OR the lead's original interest
      const targetUnitId = tenantData.unitId || lead.interestedUnit;

      if (targetUnitId) {
        // We rely on LeaseService to handle unit status and lease creation.
        // However, we need to fetch the unit to get the rent first?
        const unit = await unitModel.findById(targetUnitId, connection);

        if (unit) {
          const currentDay = getLocalTime();
          const leaseStart = startDate ? parseLocalDate(startDate) : currentDay;
          let leaseEnd;

          // Fetch lease term if ID provided
          const leaseTermId = tenantData.leaseTermId || lead.leaseTermId;
          let leaseTerm = null;
          if (leaseTermId) {
            leaseTerm = await leaseTermModel.findById(leaseTermId, connection);
          }

          if (endDate) {
            leaseEnd = parseLocalDate(endDate);
          } else if (leaseTerm && leaseTerm.durationMonths) {
            leaseEnd = addMonths(leaseStart, leaseTerm.durationMonths);
          } else {
            // Default to 1 year
            leaseEnd = addMonths(leaseStart, 12);
          }

          // [C1.3 FIX] Make security deposit configurable
          const monthlyRent = fromCents(unit.monthlyRent);
          const securityDepositLKR =
            tenantData.securityDeposit !== undefined
              ? parseFloat(tenantData.securityDeposit)
              : monthlyRent; // Fallback to 1 month

          // Use LeaseService with the existing transaction connection
          const { leaseId, magicToken: internalMagicToken } =
            await leaseService.createLease(
              {
                tenantId: userId,
                unitId: targetUnitId,
                startDate: leaseStart,
                endDate: leaseEnd,
                leaseTermId: leaseTermId,
                monthlyRent: monthlyRent,
                targetDeposit: securityDepositLKR,
                documentUrl: tenantData.documentUrl || null,
              },
              connection,
              user // Pass the acting user here
            );

          // [NEW] Capture context for Notification email
          mailData.leaseId = leaseId;
          mailData.magicToken = internalMagicToken;
          mailData.propertyName = unit.propertyName;
          mailData.unitNumber = unit.unitNumber;
          mailData.depositAmount = securityDepositLKR;
        }
      }

      await connection.commit();

      // RELEASE LOCK: Clear reservation on success
      if (targetUnitId) {
        unitLockService.releaseLock(targetUnitId);
      }

      try {
        // [CRITICAL FIX] Send email ONLY after successful transaction commit
        if (mailData.leaseId) {
          if (mailData.magicToken) {
            // Send Deposit Magic Link
            await emailService.sendDepositMagicLink(
              mailData.email,
              mailData.name,
              mailData.propertyName || 'Property',
              mailData.unitNumber || 'N/A',
              mailData.depositAmount,
              mailData.magicToken
            );
          } else {
            // Zero deposit path - notify draft is ready
            await emailService.sendDraftLeaseNotification(
              mailData.email,
              mailData.name,
              mailData.propertyName || 'Property',
              mailData.unitNumber || 'N/A'
            );
            // If new user, ALSO send account setup invitation for credentials
            if (invitationToken) {
              await emailService.sendInvitationEmail(
                mailData.email,
                'tenant',
                invitationToken
              );
            }
          }
          return {
            message: mailData.magicToken
              ? 'Lead converted successfully. Deposit payment link sent.'
              : 'Lead converted successfully. Draft lease is ready.',
            tenantId: userId,
            leaseId: mailData.leaseId,
            magicLinkSent: true,
          };
        }
      } catch (err) {
        console.error('Failed to send conversion notification email:', err);
        return {
          message:
            'Lead converted successfully, but notification email failed to send. Please resend manually.',
          tenantId: userId,
          leaseId: mailData.leaseId,
          magicLinkSent: false,
          error: 'Email delivery failed',
        };
      }

      return {
        message: 'Lead converted successfully',
        tenantId: userId,
        leaseId: mailData.leaseId,
        magicLinkSent: false,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async triggerOnboarding(userId, connection = null) {
    const db = connection || pool;
    const user = await userModel.findById(userId, db);
    if (!user) {
      console.error(
        `[UserService] Onboarding failed: User ${userId} not found.`
      );
      return;
    }

    // Generate token for password setup (invitation)
    const token = sign(
      { id: userId, type: 'setup_password', role: 'tenant' },
      JWT_SECRET,
      { expiresIn: '48h' }
    );

    try {
      await emailService.sendInvitationEmail(user.email, 'tenant', token);
    } catch (err) {
      console.error(
        `[UserService] Failed to send onboarding email to ${user.email}:`,
        err
      );
    }

    // Log audit trail
    try {
      await auditLogger.log(
        {
          userId: null, // System action
          actionType: 'TENANT_ONBOARDING_TRIGGERED',
          entityId: userId,
          entityType: 'user',
          details: { email: user.email },
        },
        null,
        db
      );
    } catch (err) {
      console.error('[UserService] Failed to log onboarding audit:', err);
    }
  }
}

export default new UserService();
