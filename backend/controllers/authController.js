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
  // LOGIN: Checks email & password. If correct, gives a digital "Key" (Token).
  login = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;

    // 1. [VALIDATION] Normalize credentials for search consistency
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    // 2. [DELEGATION] Verification: Delegate identity check to AuthService
    const result = await authService.login(normalizedEmail, password);

    // 3. [RESPONSE] Dispatch the session token and user profile
    res.json(result);
  });

  // VERIFY EMAIL: Confirm user identity via an out-of-band token link.
  verifyEmail = catchAsync(async (req, res, next) => {
    const { token } = req.body;

    // 1. [DELEGATION] Token Reconciliation: Check token validity and mark user as verified
    const result = await authService.verifyEmail(token);

    res.json(result);
  });

  // SETUP PASSWORD: The final step in the onboarding flow, converting a prospect to a tenant.
  setupPassword = catchAsync(async (req, res, next) => {
    const { token, password, tenantData: initialTenantData } = req.body;
    let tenantData = initialTenantData;

    // 1. [DATA] Asset Processing: If a NIC/ID file was uploaded, attach its cloud URL to the profile
    if (req.file) {
      tenantData = tenantData || {};
      tenantData.nicUrl = req.file.url;
    }

    // 2. [DELEGATION] Vaulting: Persist the new password and final tenant details
    const result = await authService.setupPassword(token, password, tenantData);

    res.json(result);
  });
}

export default new AuthController();
