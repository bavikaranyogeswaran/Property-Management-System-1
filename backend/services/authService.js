// ============================================================================
//  AUTHENTICATION SERVICE (The Identity Verifier)
// ============================================================================
//  This service handles the logic for confirming who a user is.
//  It manages login, password resets, and email verification tokens.
// ============================================================================

import bcrypt from 'bcryptjs';
import logger from '../utils/logger.js';
import jwt from 'jsonwebtoken';
const { sign } = jwt;
import userModel from '../models/userModel.js';
import tenantModel from '../models/tenantModel.js';
import auditLogger from '../utils/auditLogger.js';
import { ROLES } from '../utils/roleUtils.js';

import { config } from '../config/config.js';
import AppError from '../utils/AppError.js';

import securityTokenService from './securityTokenService.js';
import emailService from '../utils/emailService.js';

const JWT_SECRET = config.jwt.secret;

class AuthService {
  // LOGIN: Verifies credentials and issues a JWT "Access Card".
  async login(email, password) {
    const user = await userModel.findByEmail(email);

    if (!user || user.status !== 'active') {
      logger.warn('[AUTH] Login failed: User not found or inactive', {
        email,
        exists: !!user,
        status: user?.status,
      });
      throw new AppError('Invalid credentials', 401);
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      logger.warn('[AUTH] Login failed: Invalid password', {
        email,
        userId: user.id,
      });
      throw new AppError('Invalid credentials', 401);
    }

    logger.info('[AUTH] Login successful', { email, userId: user.id });

    const token = sign(
      {
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
        tokenVersion: user.tokenVersion || 0,
      },
      JWT_SECRET,
      { expiresIn: config.jwt.expiresIn }
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
  // VERIFY EMAIL: Confirms the user's email is real using a one-time token.
  async verifyEmail(token) {
    // [HARDENED] Use Opaque Token from Redis
    const tokenData = await securityTokenService.consumeToken(token, 'verify');

    if (!tokenData) {
      throw new Error('Invalid or expired verification token');
    }

    await userModel.verifyEmail(tokenData.userId);
    return { message: 'Email verified successfully' };
  }

  // SETUP PASSWORD: The final step of onboarding where a new user sets their password.
  async setupPassword(token, password, tenantData = null) {
    // [HARDENED] Use Opaque Token from Redis
    const tokenData = await securityTokenService.consumeToken(token, 'setup');

    if (!tokenData) {
      throw new Error('Invalid or expired setup token');
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      await userModel.setupPassword(tokenData.userId, hashedPassword);
      await userModel.incrementTokenVersion(tokenData.userId);

      if (tokenData.metadata?.role === ROLES.TENANT && tenantData) {
        await tenantModel.updateProfile(tokenData.userId, tenantData);
      }

      return { message: 'Password set successfully' };
    } catch (error) {
      console.error('Setup password error:', error.message);
      throw new Error(error.message || 'Internal error during password setup');
    }
  }

  // REQUEST PASSWORD RESET: Sends a "Rescue Link" to the user's email if they forgot their password.
  async requestPasswordReset(email) {
    // 1. Find user (don't throw error if not found - security parity)
    const user = await userModel.findByEmail(email);

    // 2. If user exists, generate token and send email
    if (user) {
      // [HARDENED] Use Opaque Token (Random Bytes in Redis)
      const resetToken = await securityTokenService.createToken(
        user.id,
        'reset',
        3600 // 1 hour
      );

      await emailService.sendPasswordResetEmail(user.email, resetToken);

      // Log audit
      try {
        await auditLogger.log({
          userId: user.id,
          actionType: 'PASSWORD_RESET_REQUESTED',
          entityId: user.id,
          entityType: 'user',
          details: { email },
        });
      } catch (e) {
        console.error('Audit log failed for password reset request:', e);
      }
    }

    // Always return generic success
    return { message: 'If an account exists, a reset link has been sent.' };
  }

  // RESET PASSWORD: Uses the "Rescue Link" to actually change the password.
  async resetPassword(token, newPassword) {
    // [HARDENED] Use Opaque Token from Redis (Ensures one-time use)
    const tokenData = await securityTokenService.consumeToken(token, 'reset');

    if (!tokenData) {
      throw new Error('Invalid or expired reset token');
    }

    try {
      // 2. Find user
      const user = await userModel.findById(tokenData.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // 3. Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // 4. Update password
      await userModel.updatePassword(tokenData.userId, hashedPassword);
      await userModel.incrementTokenVersion(tokenData.userId);

      // Log audit
      try {
        await auditLogger.log({
          userId: tokenData.userId,
          actionType: 'PASSWORD_RESET_COMPLETED',
          entityId: tokenData.userId,
          entityType: 'user',
        });
      } catch (e) {
        console.error('Audit log failed for password reset completion:', e);
      }

      return { message: 'Password has been reset successfully' };
    } catch (error) {
      throw new Error(error.message || 'Internal error during password reset');
    }
  }
}

export default new AuthService();
