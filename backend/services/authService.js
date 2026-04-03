import bcrypt from 'bcryptjs';
const { compare } = bcrypt;
import jwt from 'jsonwebtoken';
const { sign } = jwt;
import userModel from '../models/userModel.js';
import tenantModel from '../models/tenantModel.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET is not set in the environment variables.');

class AuthService {
  async login(email, password) {
    const user = await userModel.findByEmail(email);

    if (!user || user.status !== 'active') {
      throw new Error('Invalid credentials');
    }

    const isValid = await compare(password, user.passwordHash);

    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    const token = sign(
      { id: user.id, role: user.role, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return {
      token,
      user: {
        id: user.id,
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
      const decoded = jwt.verify(token, JWT_SECRET);
      
      if (decoded.type !== 'setup_password' && decoded.type !== 'invite') {
        throw new Error('Invalid token type');
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await userModel.setupPassword(decoded.id, hashedPassword);

      if (decoded.role === 'tenant' && tenantData) {
        // tenantModel.updateProfile will only update provided fields
        await tenantModel.updateProfile(decoded.id, tenantData);
      }

      return { message: 'Password set successfully' };
    } catch (error) {
      console.error('Setup password error:', error.message);
      throw new Error(error.message || 'Invalid or expired setup token');
    }
  }

  async requestPasswordReset(email) {
    // 1. Find user (don't throw error if not found - security parity)
    const user = await userModel.findByEmail(email);
    
    // 2. If user exists, generate token and send email
    if (user) {
      const resetToken = jwt.sign(
        { id: user.id, type: 'reset' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      await emailService.sendPasswordResetEmail(user.email, resetToken);
      
      // Log audit
      try {
        const auditLogger = (await import('../utils/auditLogger.js')).default;
        await auditLogger.log({
          userId: user.id,
          actionType: 'PASSWORD_RESET_REQUESTED',
          entityId: user.id,
          details: { email }
        });
      } catch (e) {
        console.error('Audit log failed for password reset request:', e);
      }
    }

    // Always return generic success
    return { message: 'If an account exists, a reset link has been sent.' };
  }

  async resetPassword(token, newPassword) {
    try {
      // 1. Verify token
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type !== 'reset') {
        throw new Error('Invalid token type');
      }

      // 2. Find user
      const user = await userModel.findById(decoded.id);
      if (!user) {
        throw new Error('User not found');
      }

      // 3. Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // 4. Update password
      await userModel.updatePassword(decoded.id, hashedPassword);

      // Log audit
      try {
        const auditLogger = (await import('../utils/auditLogger.js')).default;
        await auditLogger.log({
          userId: decoded.id,
          actionType: 'PASSWORD_RESET_COMPLETED',
          entityId: decoded.id
        });
      } catch (e) {
        console.error('Audit log failed for password reset completion:', e);
      }

      return { message: 'Password has been reset successfully' };
    } catch (error) {
      throw new Error(error.message || 'Invalid or expired reset token');
    }
  }
}

export default new AuthService();
