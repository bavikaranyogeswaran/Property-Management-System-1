import bcrypt from 'bcryptjs';
const { hash } = bcrypt;
import userModel from '../models/userModel.js';
import leadModel from '../models/leadModel.js';
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

    async getUserById(id) {
        const user = await userModel.findById(id);
        if (user) {
            // Remove sensitive data
            delete user.password_hash;
        }
        return user;
    }

    // Convert lead to tenant
    async convertLeadToTenant(leadId, providedPassword) {
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
                await userModel.update(userId, { role: 'tenant' });
                // Send confirmation
                await emailService.sendTenantConfirmation(existingUser.email, existingUser.name);
            }
        } else {
            // Create new tenant user
            // Use provided password or fallback to random (though UI enforces it now)
            const passwordToUse = providedPassword || Math.random().toString(36).slice(-8);
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

        return { message: 'Lead converted successfully', tenantId: userId };
    }
}

export default new UserService();
