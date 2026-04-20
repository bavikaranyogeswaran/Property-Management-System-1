// ============================================================================
//  USER CONTROLLER (The Staff Manager)
// ============================================================================
//  This file handles managing people: Treasurers, Tenants, and Owners.
//  It allows hiring staff, updating profiles, and assigning work.
// ============================================================================

import userService from '../services/userService.js';
import staffModel from '../models/staffModel.js';
import { validateEmail } from '../utils/validators.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

class UserController {
  // HIRE TREASURER: Owner adds a new staff member to handle money.
  createTreasurer = catchAsync(async (req, res) => {
    const {
      name,
      email,
      phone,
      nic,
      employeeId,
      jobTitle,
      shiftStart,
      shiftEnd,
    } = req.body;

    // 1. [VALIDATION] Integrity Check
    if (!name || !email || !phone)
      throw new AppError('All fields are required', 400);

    // 2. [VALIDATION] Format Verification
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid)
      throw new AppError(emailValidation.error, 400);

    const staffData = { nic, employeeId, jobTitle, shiftStart, shiftEnd };

    // 3. [DELEGATION] Identity Provisioning: Create the login account and link it to a staff profile
    const result = await userService.createTreasurer(
      name,
      email,
      phone,
      null,
      staffData,
      req.user
    );
    res.status(201).json(result);
  });

  // UPDATE TREASURER: Updates details like name, phone, or job status for a staff member.
  updateTreasurer = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, status } = req.body;

    // 1. [VALIDATION] Schema Check
    if (email) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid)
        throw new AppError(emailValidation.error, 400);
    }

    // 2. [DELEGATION] Vault Update
    const result = await userService.updateTreasurer(id, {
      name,
      email,
      phone,
      status,
    });
    res.json(result);
  });

  // UPDATE PROFILE: Allows a user (Tenant or Staff) to update their own personal info.
  updateProfile = catchAsync(async (req, res) => {
    // 1. [SECURITY] Scope Guard: Lock target to the authenticated session owner
    const id = req.user.id;
    const {
      name,
      email,
      phone,
      emergencyContactName,
      emergencyContactPhone,
      employmentStatus,
      permanentAddress,
    } = req.body;

    // 2. [VALIDATION] Format Check
    if (email) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid)
        throw new AppError(emailValidation.error, 400);
    }

    // 3. [DELEGATION] Vault Update
    const result = await userService.updateUserProfile(id, {
      name,
      email,
      phone,
      emergencyContactName,
      emergencyContactPhone,
      employmentStatus,
      permanentAddress,
    });
    res.json(result);
  });

  // GET PROFILE: Fetches the current user's profile data for display.
  getProfile = catchAsync(async (req, res) => {
    // 1. [SECURITY] Resolve ID from token
    const id = req.user.id;
    // 2. [DATA] Resolution
    const user = await userService.getUserById(id);
    if (!user) throw new AppError('User not found', 404);
    res.json(user);
  });

  // DELETE TREASURER: Removes a staff member from the system (Owner only).
  deleteTreasurer = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Purge Logic: Revoke access and archive history
    const result = await userService.deleteTreasurer(id);
    res.json(result);
  });

  // GET TREASURERS: Lists all staff members currently employed.
  getTreasurers = catchAsync(async (req, res) => {
    // 1. [DATA] Collection Retrieval
    const result = await userService.getTreasurers();
    res.json(result);
  });

  // GET OWNERS: Lists the property owners in the system.
  getOwners = catchAsync(async (req, res) => {
    // 1. [DATA] Collection Retrieval
    const result = await userService.getOwners();
    res.json(result);
  });

  // GET TENANTS: Fetches the list of people living in the properties.
  getTenants = catchAsync(async (req, res) => {
    let result;
    // 1. [SECURITY] Portfolio Filter: Resolve tenants based on property assignments for staff or direct ownership
    if (req.user.role === 'owner') {
      result = await userService.getTenants(req.user.id);
    } else if (req.user.role === 'treasurer') {
      result = await userService.getTenants(null, req.user.id);
    }

    res.json(result);
  });

  // GET USER BY ID: Fetches full details for a specific person in the system.
  getUserById = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [SECURITY] Authorization Guard: Only owners can view others; users can only view themselves
    if (req.user.role !== 'owner' && req.user.id !== parseInt(id)) {
      throw new AppError('Access denied.', 403);
    }

    // 2. [DATA] Resolution
    const user = await userService.getUserById(id);
    if (!user) throw new AppError('User not found', 404);
    res.json(user);
  });

  // ASSIGN PROPERTY: Owner tells a Treasurer "You are responsible for this Building".
  assignProperty = catchAsync(async (req, res) => {
    const { userId, propertyId } = req.body;
    const actorId = req.user.id || req.user.user_id;

    // 1. [DELEGATION] Permission Logic: Map staff member to a property for security context resolution
    const result = await userService.assignProperty(
      userId,
      propertyId,
      actorId
    );
    res.json(result);
  });

  // REMOVE PROPERTY: Revokes a Treasurer's responsibility over a specific building.
  removeProperty = catchAsync(async (req, res) => {
    const { userId, propertyId } = req.params;
    const actorId = req.user.id || req.user.user_id;

    // 1. [DELEGATION] Permission Logic: Break the staff-property link
    const result = await userService.removeProperty(
      userId,
      propertyId,
      actorId
    );
    res.json(result);
  });

  // GET ASSIGNED PROPERTIES: Shows which buildings a specific Treasurer is managing.
  getAssignedProperties = catchAsync(async (req, res) => {
    // 1. [SECURITY] Authorization Guard
    if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
      throw new AppError('Access denied.', 403);
    }
    const { userId } = req.params;
    if (req.user.role === 'treasurer' && parseInt(userId) !== req.user.id) {
      throw new AppError('Access denied.', 403);
    }

    // 2. [DATA] Retrieval
    const properties = await staffModel.getAssignedProperties(userId);
    res.json(properties);
  });

  // FORCE LOGOUT: Instantly logs a user out of all devices (Security measure).
  forceLogout = catchAsync(async (req, res) => {
    const { id } = req.params;
    const actorId = req.user.id || req.user.user_id;

    // 1. [SIDE EFFECT] Authentication Revocation: Invalidate sessions across all active pools
    const result = await userService.forceLogout(id, actorId, req.body.reason);
    res.json(result);
  });

  // RESEND INVITATION: Sends a new "Welcome" email to a user who hasn't joined yet.
  resendInvitation = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [SIDE EFFECT] Communication: Trigger onboarding workflow
    const result = await userService.resendInvitation(id);
    res.json(result);
  });
}

export default new UserController();
