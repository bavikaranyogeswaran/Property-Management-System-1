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
import redis from '../config/redis.js';

const JWT_SECRET = config.jwt.secret;

class AuthService {
  // LOGIN: Verifies credentials and issues a JWT "Access Card".
  // LOGIN: Primary entry point for user sessions. Verifies credentials and issues a multi-factor-ready JWT.
  async login(email, password) {
    // 0. [SECURITY] Check for account lockout (Defense against brute-force)
    const normalizedEmail = email ? email.toLowerCase().trim() : '';
    const lockoutKey = `lockout:login:${normalizedEmail}`;
    const failedAttempts = await redis.get(lockoutKey);

    if (failedAttempts && parseInt(failedAttempts) >= 5) {
      logger.warn('[AUTH] Login blocked: Account locked', {
        email: normalizedEmail,
      });
      throw new AppError(
        'Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.',
        429
      );
    }

    // 1. [SECURITY] Identify user and verify active status (Block locked/purged accounts)
    const user = await userModel.findByEmail(normalizedEmail);
    if (!user || user.status !== 'active') {
      logger.warn('[AUTH] Login failed: User not found or inactive', {
        email: normalizedEmail,
        exists: !!user,
        status: user?.status,
      });
      // We still increment attempts even for non-existent users to prevent enumeration if needed,
      // but here we just throw to match existing logic.
      throw new AppError('Invalid credentials', 401);
    }

    // 2. [SECURITY] Cryptographic password comparison (Constant-time to prevent timing attacks)
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      logger.warn('[AUTH] Login failed: Invalid password', {
        email: normalizedEmail,
        userId: user.id,
      });

      // [NEW] Increment failed attempts and set 15-minute TTL on first failure
      const attempts = await redis.incr(lockoutKey);
      if (attempts === 1) {
        await redis.expire(lockoutKey, 900);
      }

      throw new AppError('Invalid credentials', 401);
    }

    // 3. [SECURITY] Reset failed attempts on success
    await redis.del(lockoutKey);

    // 4. [AUDIT] Log successful entry
    logger.info('[AUTH] Login successful', {
      email: normalizedEmail,
      userId: user.id,
    });

    // 4. [SECURITY] Issue JWT with Token Versioning (Allows global logout by incrementing token version in DB)
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
  // VERIFY EMAIL: Public endpoint to activate a user's contact point via a secure magic link.
  async verifyEmail(token) {
    // 1. [SECURITY] Consume Opaque Token (Enforces one-time use and TTL)
    const tokenData = await securityTokenService.consumeToken(token, 'verify');
    if (!tokenData) throw new Error('Invalid or expired verification token');

    // 2. Perform DB activation
    await userModel.verifyEmail(tokenData.userId);
    return { message: 'Email verified successfully' };
  }

  // SETUP PASSWORD: The final step of onboarding where a new user sets their password.
  // SETUP PASSWORD: The final onboarding step. Sets user identity and hydrates profile data.
  async setupPassword(token, password, tenantData = null) {
    // 1. [SECURITY] Validate Magic Link Token
    const tokenData = await securityTokenService.consumeToken(token, 'setup');
    if (!tokenData) throw new Error('Invalid or expired setup token');

    try {
      // 2. [SECURITY] Generate salted hash for the new password
      const hashedPassword = await bcrypt.hash(password, 10);

      // 3. Atomically set password and invalidate all existing tokens (Security reset)
      await userModel.setupPassword(tokenData.userId, hashedPassword);
      await userModel.incrementTokenVersion(tokenData.userId);

      // 4. [SIDE EFFECT] If invite was for a Tenant, hydrate their specific profile fields
      if (tokenData.metadata?.role === ROLES.TENANT && tenantData) {
        await tenantModel.updateProfile(tokenData.userId, tenantData);
      }

      return { message: 'Account secured.' };
    } catch (error) {
      console.error('Setup password error:', error.message);
      throw new Error(error.message || 'Error during account security setup.');
    }
  }

  // REQUEST PASSWORD RESET: Sends a "Rescue Link" to the user's email if they forgot their password.
  // REQUEST PASSWORD RESET: Security-neutral flow to deliver rescue links.
  async requestPasswordReset(email) {
    // 1. [SECURITY] Identify user (Parity: always return generic success to avoid email enum leaks)
    const user = await userModel.findByEmail(email);

    if (user) {
      // 2. [SECURITY] Generate secure opaque token with 1-hour TTL
      const resetToken = await securityTokenService.createToken(
        user.id,
        'reset',
        3600
      );

      // 3. [SIDE EFFECT] Deliver rescue email
      await emailService.sendPasswordResetEmail(user.email, resetToken);

      // 4. [AUDIT] Track breach/recovery attempt
      try {
        await auditLogger.log({
          userId: user.id,
          actionType: 'PASSWORD_RESET_REQUESTED',
          entityId: user.id,
          entityType: 'user',
          details: { email },
        });
      } catch (e) {
        console.error('Audit fail:', e);
      }
    }

    return { message: 'If an account exists, a reset link has been sent.' };
  }

  // RESET PASSWORD: Uses the "Rescue Link" to actually change the password.
  // RESET PASSWORD: Finalizes account recovery via a validated magic link.
  async resetPassword(token, newPassword) {
    // 1. [SECURITY] Validate and Consume reset link (Single-use enforcement)
    const tokenData = await securityTokenService.consumeToken(token, 'reset');
    if (!tokenData) throw new Error('Invalid or expired reset token');

    try {
      const user = await userModel.findById(tokenData.userId);
      if (!user) throw new Error('User not found');

      // 2. [SECURITY] Hash replacement password and rotate JWT version (Invalidates all existing logins)
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await userModel.updatePassword(tokenData.userId, hashedPassword);
      await userModel.incrementTokenVersion(tokenData.userId);

      // 3. [AUDIT] Log critical security event
      try {
        await auditLogger.log({
          userId: tokenData.userId,
          actionType: 'PASSWORD_RESET_COMPLETED',
          entityId: tokenData.userId,
          entityType: 'user',
        });
      } catch (e) {
        console.error('Audit fail:', e);
      }

      return { message: 'Password has been reset successfully' };
    } catch (error) {
      throw new Error(error.message || 'Internal error during password reset');
    }
  }
}

export default new AuthService();
