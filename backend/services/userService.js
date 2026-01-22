import { hash } from 'bcryptjs';
import userModel from '../models/userModel.js';
import emailService from '../utils/emailService.js';

const SALT_ROUNDS = 10;

class UserService {
    async createTreasurer(name, email, password) {
        // Validation handled in Controller or here (DAL checks duplicate email)
        const existingUser = await userModel.findByEmail(email);
        if (existingUser) {
            throw new Error('Email already in use');
        }

        const hashedPassword = await hash(password, SALT_ROUNDS);

        const userId = await userModel.create({
            name,
            email,
            passwordHash: hashedPassword,
            role: 'treasurer',
            status: 'active'
        });

        // Send credentials via email
        await emailService.sendCredentials(email, 'treasurer', password);

        return { id: userId, name, email, role: 'treasurer' };
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
