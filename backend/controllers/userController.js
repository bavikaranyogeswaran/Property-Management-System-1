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
  //  HIRE TREASURER: Owner adds a new staff member to handle money.
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

    if (!name || !email || !phone) {
      throw new AppError('All fields are required', 400);
    }

    // Email validation
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      throw new AppError(emailValidation.error, 400);
    }

    const staffData = { nic, employeeId, jobTitle, shiftStart, shiftEnd };

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

    // Email validation if email is being updated
    if (email) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        throw new AppError(emailValidation.error, 400);
      }
    }

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
    // Self-update only
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

    if (email) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        throw new AppError(emailValidation.error, 400);
      }
    }

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
    const id = req.user.id;
    const user = await userService.getUserById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    res.json(user);
  });

  // DELETE TREASURER: Removes a staff member from the system (Owner only).
  deleteTreasurer = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await userService.deleteTreasurer(id);
    res.json(result);
  });

  // GET TREASURERS: Lists all staff members currently employed.
  getTreasurers = catchAsync(async (req, res) => {
    const result = await userService.getTreasurers();
    res.json(result);
  });

  // GET OWNERS: Lists the property owners in the system.
  getOwners = catchAsync(async (req, res) => {
    const result = await userService.getOwners();
    res.json(result);
  });

  //  GET TENANTS: Fetches the list of people living in the properties.
  getTenants = catchAsync(async (req, res) => {
    let result;
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
    if (req.user.role !== 'owner' && req.user.id !== parseInt(id)) {
      throw new AppError('Access denied.', 403);
    }

    const user = await userService.getUserById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    res.json(user);
  });

  //  ASSIGN PROPERTY: Owner tells a Treasurer "You are responsible for this Building".
  assignProperty = catchAsync(async (req, res) => {
    const { userId, propertyId } = req.body;
    const actorId = req.user.id || req.user.user_id;

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

    const result = await userService.removeProperty(
      userId,
      propertyId,
      actorId
    );
    res.json(result);
  });

  // GET ASSIGNED PROPERTIES: Shows which buildings a specific Treasurer is managing.
  getAssignedProperties = catchAsync(async (req, res) => {
    if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
      throw new AppError('Access denied.', 403);
    }
    const { userId } = req.params;
    if (req.user.role === 'treasurer' && parseInt(userId) !== req.user.id) {
      throw new AppError('Access denied.', 403);
    }

    const properties = await staffModel.getAssignedProperties(userId);
    res.json(properties);
  });

  // FORCE LOGOUT: Instantly logs a user out of all devices (Security measure).
  forceLogout = catchAsync(async (req, res) => {
    const { id } = req.params;
    const actorId = req.user.id || req.user.user_id;

    const result = await userService.forceLogout(id, actorId, req.body.reason);
    res.json(result);
  });

  // RESEND INVITATION: Sends a new "Welcome" email to a user who hasn't joined yet.
  resendInvitation = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await userService.resendInvitation(id);
    res.json(result);
  });
}

export default new UserController();
