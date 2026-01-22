import { compare } from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import userModel from '../models/userModel.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

class AuthService {
    async login(email, password) {
        const user = await userModel.findByEmail(email);

        if (!user || user.status !== 'active') {
            throw new Error('Invalid credentials');
        }

        const isValid = await compare(password, user.password_hash);

        if (!isValid) {
            throw new Error('Invalid credentials');
        }

        const token = sign(
            { id: user.user_id, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        return {
            token,
            user: {
                id: user.user_id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        };
    }
}

export default new AuthService();
