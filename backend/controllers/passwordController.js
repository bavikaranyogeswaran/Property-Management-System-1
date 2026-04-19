// ============================================================================
//  PASSWORD CONTROLLER (The Locksmith)
// ============================================================================
//  This file handles user credentials securely.
//  Manges forgotten passwords, resets, and manual password changes.
// ============================================================================

import authService from '../services/authService.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';
import userModel from '../models/userModel.js';
import bcrypt from 'bcryptjs';

class PasswordController {
  // FORGOT PASSWORD: Sends a secure reset link to the user's email.
  forgotPassword = catchAsync(async (req, res, next) => {
    const { email } = req.body;
    if (!email) {
      return next(new AppError('Email is required', 400));
    }

    const result = await authService.requestPasswordReset(email);
    res.json(result);
  });

  // RESET PASSWORD: Uses the email token to set a new password.
  resetPassword = catchAsync(async (req, res, next) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return next(new AppError('Token and new password are required', 400));
    }

    const result = await authService.resetPassword(token, newPassword);
    res.json(result);
  });

  // CHANGE PASSWORD: User manually updates their password while logged in.
  changePassword = catchAsync(async (req, res, next) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return next(new AppError('Current and new password are required', 400));
    }

    if (newPassword.length < 8) {
      return next(new AppError('Password must be at least 8 characters', 400));
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const validPassword = await bcrypt.compare(
      currentPassword,
      user.passwordHash || user.password_hash
    );
    if (!validPassword) {
      return next(new AppError('Incorrect current password', 401));
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await userModel.updatePassword(userId, passwordHash);

    res.json({ message: 'Password updated successfully' });
  });
}

export default new PasswordController();
