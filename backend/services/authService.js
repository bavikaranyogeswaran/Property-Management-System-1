import bcrypt from 'bcryptjs';
const { compare } = bcrypt;
import jwt from 'jsonwebtoken';
const { sign } = jwt;
import userModel from '../models/userModel.js';
import tenantModel from '../models/tenantModel.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

class AuthService {
  async login(email, password) {
    const user = await userModel.findByEmail(email);

    if (!user || user.status !== 'active') {
      throw new Error('Invalid credentials');
    }

    if (user.role === 'lead' && !user.is_email_verified) {
      throw new Error('Please verify your email address to login.');
    }

    const isValid = await compare(password, user.password_hash);

    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    const token = sign(
      { id: user.user_id, role: user.role, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return {
      token,
      user: {
        id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
  async verifyEmail(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type !== 'verify_email') {
        throw new Error('Invalid token type');
      }

      await userModel.verifyEmail(decoded.id);
      return { message: 'Email verified successfully' };
    } catch (error) {
      throw new Error('Invalid or expired verification token');
    }
  }

  async setupPassword(token, password, tenantData = null) {
    try {
      console.log('--- SETUP PASSWORD REQUEST ---');
      console.log('Received tenantData:', tenantData);
      const decoded = jwt.verify(token, JWT_SECRET);
      console.log('Decoded Token:', decoded);
      
      if (decoded.type !== 'setup_password' && decoded.type !== 'invite') {
        throw new Error('Invalid token type');
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await userModel.setupPassword(decoded.id, hashedPassword);

      console.log('Checking conditions:', { role: decoded.role, hasTenantData: !!tenantData });
      if (decoded.role === 'tenant' && tenantData) {
        console.log('Updating tenant profile...');
        // tenantModel.updateProfile will only update provided fields
        await tenantModel.updateProfile(decoded.id, tenantData);
        console.log('Tenant profile updated.');
      } else {
        console.log('Skipping tenant profile update.');
      }

      return { message: 'Password set successfully' };
    } catch (error) {
      console.error('Setup password error:', error);
      throw new Error(error.message || 'Invalid or expired setup token');
    }
  }
}

export default new AuthService();
