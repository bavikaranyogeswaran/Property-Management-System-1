// ============================================================================
//  AUTH CONTROLLER (The Security Guard)
// ============================================================================
//  This file handles all "Entry" requests: Logging in, Setting passwords, etc.
//  It verifies who you are before letting you into the system.
// ============================================================================

import authService from '../services/authService.js';
import catchAsync from '../utils/catchAsync.js';
import { validatePassword, validateEmail } from '../utils/validators.js';
import AppError from '../utils/AppError.js';

class AuthController {
  //  LOGIN: Checks email & password. If correct, gives a digital "Key" (Token).
  login = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;
    const normalizedEmail = email ? email.toLowerCase().trim() : '';
    const result = await authService.login(normalizedEmail, password);
    res.json(result);
  });

  verifyEmail = catchAsync(async (req, res, next) => {
    const { token } = req.body;
    const result = await authService.verifyEmail(token);
    res.json(result);
  });

  setupPassword = catchAsync(async (req, res, next) => {
    const { token, password, tenantData: initialTenantData } = req.body;
    let tenantData = initialTenantData;

    // If a file was uploaded, add its path to tenantData
    if (req.file) {
      tenantData = tenantData || {};
      tenantData.nicUrl = req.file.url;
    }

    const result = await authService.setupPassword(token, password, tenantData);
    res.json(result);
  });
}

export default new AuthController();
