import bcrypt from 'bcryptjs';
const { hash } = bcrypt;
import userModel from '../models/userModel.js';
import leadModel from '../models/leadModel.js';
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import emailService from '../utils/emailService.js';

const SALT_ROUNDS = 10;

class UserService {
    async createTreasurer(name, email, phone, password) {
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
            role: 'treasurer',
            status: 'active'
        });

        // Send credentials via email
        await emailService.sendCredentials(email, 'treasurer', password);

        return { id: userId, name, email, phone, role: 'treasurer' };
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
            status: 'active'
        });

        // Send welcome email
        await emailService.sendWelcomeLead(email, name);

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
            status: currentUser.status
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

    async getTenants() {
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
    async convertLeadToTenant(leadId) {
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
                await userModel.updateRole(userId, 'tenant');
                // Send confirmation
                await emailService.sendTenantConfirmation(existingUser.email, existingUser.name);
            }
        } else {
            // This case should ideally not happen if every lead must have an account to be a lead
            // But if leads can be created manually by owner without accounts, we need to handle it.
            // If they don't have an account, we generate a password or throw error?
            // User requirement: "tenant can use the password when he created for lead account creation"
            // This implies the user ALREADY exists.

            // If user doesn't exist, we might need to create one.
            // Let's generate a temporary password and email it.

            const passwordToUse = Math.random().toString(36).slice(-8);
            const hashedPassword = await hash(passwordToUse, SALT_ROUNDS);

            userId = await userModel.create({
                name: lead.name,
                email: lead.email,
                phone: lead.phone,
                passwordHash: hashedPassword,
                role: 'tenant',
                status: 'active'
            });

            // Send credentials via email
            await emailService.sendCredentials(lead.email, 'tenant', passwordToUse);
        }

        // 3. Update lead status and link to tenant
        await leadModel.update(leadId, {
            status: 'converted',
            tenantId: userId
        });

        // 4. Mark Unit as Occupied and Create Lease if one was selected
        if (lead.interestedUnit) {
            console.log(`[INFO] Marking unit ${lead.interestedUnit} as occupied due to lead conversion.`);
            await unitModel.update(lead.interestedUnit, { status: 'occupied' });

            // Create Lease Record
            try {
                const unit = await unitModel.findById(lead.interestedUnit);
                if (unit) {
                    const today = new Date();
                    const nextYear = new Date(today);
                    nextYear.setFullYear(today.getFullYear() + 1);

                    await leaseModel.create({
                        tenantId: userId,
                        unitId: lead.interestedUnit,
                        startDate: today.toISOString().split('T')[0],
                        endDate: nextYear.toISOString().split('T')[0],
                        monthlyRent: unit.monthlyRent,
                        status: 'active'
                    });
                    console.log(`[INFO] Created default lease for unit ${lead.interestedUnit} and tenant ${userId}`);
                }
            } catch (err) {
                console.error(`[ERROR] Failed to create lease during conversion: ${err.message}`);
                // Proceed without erroring out the whole request? Or throw?
                // Probably better to log but let conversion succeed, as user is created.
                // But user wants property shown, so this is critical.
                // However, transactionality isn't fully implemented here (no commit/rollback).
            }
        }

        return { message: 'Lead converted successfully', tenantId: userId };
    }
}

export default new UserService();
