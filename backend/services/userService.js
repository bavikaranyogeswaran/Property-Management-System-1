import bcrypt from 'bcryptjs';
const { hash } = bcrypt;
import userModel from '../models/userModel.js';
import leadModel from '../models/leadModel.js';
import tenantModel from '../models/tenantModel.js';
import ownerModel from '../models/ownerModel.js';
import staffModel from '../models/staffModel.js';
import jwt from 'jsonwebtoken';
const { sign } = jwt;
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import leaseService from '../services/leaseService.js';
import emailService from '../utils/emailService.js';
import leaseTermModel from '../models/leaseTermModel.js';
import pool from '../config/db.js';
import unitLockService from '../services/unitLockService.js';

const SALT_ROUNDS = 10;

class UserService {
  async createTreasurer(name, email, phone, password, staffData = {}) {
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
    if (existingUser && existingUser.user_id !== parseInt(id)) {
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
    const { name, phone } = data;

    // Fetch current user to preserve email and status
    const currentUser = await userModel.findById(id);
    if (!currentUser) {
      throw new Error('User not found');
    }

    // Email cannot be updated by user profile, use existing.
    // Status should also be preserved.
    const updated = await userModel.update(id, {
      name,
      phone,
      email: currentUser.email,
      status: currentUser.status,
    });

    if (!updated) {
      throw new Error('Update failed');
    }

    // Return current email from user object (not passed data)
    const user = await userModel.findById(id);
    return { id, name, email: user.email, phone };
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

  async getUserById(id) {
    const user = await userModel.findById(id);
    if (user) {
      // Remove sensitive data
      delete user.password_hash;
    }
    return user;
  }

  // Convert lead to tenant
  async convertLeadToTenant(leadId, startDate, endDate, tenantData = {}) {
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
        // Return existing user ID by finding user with lead's email
        const existingUser = await userModel.findByEmail(lead.email, connection);
        return { 
            message: 'Lead already converted', 
            tenantId: existingUser ? existingUser.user_id : null,
            alreadyConverted: true 
        };
      }

      // LOCKING: Ensure unit is not being processed by another conversion.
      const targetUnitIdForLock = tenantData.unitId || lead.interestedUnit;
      if (targetUnitIdForLock) {
        const lockAcquired = unitLockService.acquireLock(targetUnitIdForLock, leadId);
        if (!lockAcquired) {
          throw new Error('This unit is currently being processed by another staff member. Please wait 10 minutes or choose another unit.');
        }
      }

      // 2. Check if a user with this email already exists
      let userId;
      const existingUser = await userModel.findByEmail(lead.email, connection);

      let invitationData = null;
      if (existingUser) {
        if (existingUser.role === 'tenant') {
          // User is already an active tenant applying for another property.
          // They already have an account and password, so we just proceed with lease creation.
          userId = existingUser.user_id;
          console.log(`Lead ${leadId} is already a tenant (User ID: ${userId}). Proceeding with new lease creation.`);
        } else {
          throw new Error(`Email ${lead.email} is already associated with a ${existingUser.role} account. Cannot convert to tenant.`);
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

        const token = jwt.sign(
          { id: userId, type: 'setup_password', role: 'tenant' },
          JWT_SECRET,
          { expiresIn: '48h' }
        );
        invitationData = { email: lead.email, role: 'tenant', token };
      }

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
            monthlyIncome: tenantData.monthlyIncome || 0,
          },
          connection
        );
      }

      // 4. Update lead status (direct SQL to avoid duplicate history from leadModel.update)
      await connection.query(
        'UPDATE leads SET status = ? WHERE lead_id = ?',
        ['converted', leadId]
      );

      // 4a. Invalidate portal access tokens
      await leadTokenModel.invalidateForLead(leadId, connection);

      // 4b. Record stage history (positional args: leadId, fromStatus, toStatus, notes, connection)
      const leadStageHistoryModel = (await import('../models/leadStageHistoryModel.js')).default;
      await leadStageHistoryModel.create(
          leadId,
          lead.status,        // fromStatus — captured before the update above
          'converted',        // toStatus
          'System: Lead formally converted into an active tenant.',
          connection
      );

      // 5. Lease & Unit Logic
      // Use provided unitId (from conversion dialog) OR the lead's original interest
      const targetUnitId = tenantData.unitId || lead.interestedUnit;

      if (targetUnitId) {
        // We rely on LeaseService to handle unit status and lease creation.
        // However, we need to fetch the unit to get the rent first?
        // LeaseService expects us to pass monthlyRent.

        const unit = await unitModel.findById(targetUnitId, connection);

        if (unit) {
          const today = new Date();
          const leaseStart = startDate ? new Date(startDate) : today;
          let leaseEnd;
          
          // Fetch lease term if ID provided
          const leaseTermId = tenantData.leaseTermId || lead.leaseTermId;
          let leaseTerm = null;
          if (leaseTermId) {
            leaseTerm = await leaseTermModel.findById(leaseTermId, connection);
          }

          if (leaseTerm && leaseTerm.type === 'periodic') {
            leaseEnd = null; // Periodic leases have no fixed end date
          } else if (endDate) {
            leaseEnd = new Date(endDate);
          } else if (leaseTerm && leaseTerm.type === 'fixed' && leaseTerm.durationMonths) {
            leaseEnd = new Date(leaseStart);
            leaseEnd.setMonth(leaseStart.getMonth() + leaseTerm.durationMonths);
          } else {
            leaseEnd = new Date(leaseStart);
            leaseEnd.setFullYear(leaseStart.getFullYear() + 1);
          }

          // Use LeaseService with the existing transaction connection
          await leaseService.createLease(
            {
              tenantId: userId,
              unitId: targetUnitId,
              startDate: leaseStart,
              endDate: leaseEnd,
              leaseTermId: leaseTermId,
              monthlyRent: unit.monthlyRent,
              securityDeposit: unit.monthlyRent, // Default 1 month deposit
              documentUrl: tenantData.documentUrl || null,
            },
            connection,
            null // System action — no acting user
          );
        }
      }

      await connection.commit();

      // RELEASE LOCK: Clear reservation on success
      if (targetUnitId) {
        unitLockService.releaseLock(targetUnitId);
      }

      // [CRITICAL FIX] Send invitation email ONLY after successful transaction commit
      if (invitationData) {
        await emailService.sendInvitationEmail(invitationData.email, invitationData.role, invitationData.token);
      }

      return { message: 'Lead converted successfully', tenantId: userId };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export default new UserService();
