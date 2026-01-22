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
            // Use existing user if they match
            userId = existingUser.user_id;
            // Optionally check if they are already a tenant?
            // Since roles are ENUM('owner','tenant','treasurer'), a user has ONE role.
            // If they are an owner or treasurer, we might have an issue if we want them to be a tenant too.
            // But usually this means creating a new account or just linking.
            // For now, let's assume if they exist, we link them. 
            // If their role is NOT tenant, maybe we can't fully "convert" them in the simple sense.
            // But let's proceed with finding them.
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

        // 4. (Optional) Create Tenant Profile entry if needed (not in strict requirements but good practice)
        // await db.query('INSERT INTO tenant_profile (tenant_id, phone) VALUES (?, ?)', [userId, lead.phone]);

        return { message: 'Lead converted successfully', tenantId: userId };
    }
}

export default new UserService();
