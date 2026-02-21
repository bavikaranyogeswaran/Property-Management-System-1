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
import pool from '../config/db.js';

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
      const existingUser = await userModel.findByEmail(email);
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

  async createLeadUser(name, email, phone, password) {
    // Validation handled in Controller or here (DAL checks duplicate email)
    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      throw new Error('Email already in use');
    }

    const hashedPassword = await hash(password, SALT_ROUNDS);

    const userId = await userModel.create({
      name,
      email,
      phone,
      passwordHash: hashedPassword,
      role: 'lead',
      status: 'active',
    });

    // Generate Verification Token
    const token = jwt.sign({ id: userId, type: 'verify_email' }, JWT_SECRET, {
      expiresIn: '24h',
    });

    // Send Verification Email
    await emailService.sendVerificationEmail(email, token);

    return userId;
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
      const lead = await leadModel.findById(leadId);
      if (!lead) {
        throw new Error('Lead not found');
      }

      if (lead.status === 'converted') {
        throw new Error('Lead is already converted');
      }

      // 2. Check if user already exists
      let userId;
      const existingUser = await userModel.findByEmail(lead.email);

      if (existingUser) {
        // User exists (likely as a Lead)
        userId = existingUser.user_id;

        // If they are a lead, upgrade them to tenant
        if (existingUser.role === 'lead') {
          await userModel.updateRole(userId, 'tenant'); // Should support connection?
          // Ideally we update userModel.updateRole to accept connection too.
          // No, must be in transaction.
          await userModel.updateRole(userId, 'tenant', connection);

          // Send confirmation
          await emailService.sendTenantConfirmation(
            existingUser.email,
            existingUser.name
          );
        }
      } else {
        // Create new user
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

        // Setup Token logic handled after commit usually, or here if we want to ensure it works.
        // We'll queue it mentally.

        const token = jwt.sign(
          { id: userId, type: 'setup_password', role: 'tenant' },
          JWT_SECRET,
          { expiresIn: '48h' }
        );
        await emailService.sendInvitationEmail(lead.email, 'tenant', token);
      }

      // 3. Create Tenant Profile
      const existingTenant = await tenantModel.findByUserId(userId, connection);
      if (!existingTenant) {
        // Initialize an empty tenant profile to be filled out during password setup
        await tenantModel.create(
          {
            userId,
            nic: null,
            permanentAddress: null,
            emergencyContactName: null,
            emergencyContactPhone: null,
            employmentStatus: 'Employed', // Default value
            monthlyIncome: 0,
          },
          connection
        );
      }

      // 4. Update lead status
      // leadModel.update doesn't support connection?
      // Need to support it or use raw query.
      // user_id is likely already set if they were created as a lead, but we ensure it's linked to the converted user.
      await leadModel.update(
        leadId,
        { status: 'converted', userId },
        connection
      );

      // 5. Lease & Unit Logic
      // Use provided unitId (from conversion dialog) OR the lead's original interest
      const targetUnitId = tenantData.unitId || lead.interestedUnit;

      if (targetUnitId) {
        // We rely on LeaseService to handle unit status and lease creation.
        // However, we need to fetch the unit to get the rent first?
        // LeaseService expects us to pass monthlyRent.

        const unit = await unitModel.findById(targetUnitId);

        if (unit) {
          const today = new Date();
          const leaseStart = startDate ? new Date(startDate) : today;
          let leaseEnd;
          if (endDate) {
            leaseEnd = new Date(endDate);
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
              monthlyRent: unit.monthlyRent,
              securityDeposit: unit.monthlyRent, // Default 1 month deposit
            },
            connection
          );
        }
      }

      await connection.commit();
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
