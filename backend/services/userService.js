import bcrypt from 'bcryptjs';
const { hash } = bcrypt;
import userModel from '../models/userModel.js';
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

    // Placeholder for convertLeadToTenant
    async convertLeadToTenant(leadId, tenantData) {
        // Todo: Implement lead conversion logic
        // 1. Get lead details
        // 2. Create user (tenant)
        // 3. Update lead status
        // 4. Send email
    }
}

export default new UserService();
