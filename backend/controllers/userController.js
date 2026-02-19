// ============================================================================
//  USER CONTROLLER (The Staff Manager)
// ============================================================================
//  This file handles managing people: Treasurers, Tenants, and Owners.
//  It allows hiring staff, updating profiles, and assigning work.
// ============================================================================

import userService from '../services/userService.js';
import staffModel from '../models/staffModel.js';
import { validateEmail } from '../utils/validators.js';

class UserController {
  //  HIRE TREASURER: Owner adds a new staff member to handle money.
  async createTreasurer(req, res) {
    try {
      // RBAC Check: Only owner can create treasurer
      // Req.user is populated by authenticateToken middleware
      if (req.user.role !== 'owner') {
        return res
          .status(403)
          .json({ error: 'Access denied. Only Owners can create Treasurers.' });
      }

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
        return res.status(400).json({ error: 'All fields are required' });
      }

      // Email validation
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        return res.status(400).json({ error: emailValidation.error });
      }

      const staffData = { nic, employeeId, jobTitle, shiftStart, shiftEnd };

      // Password is NOT required here as we send an invite link.
      // We pass 'null' or empty string to service, which generates a random temp password.
      const result = await userService.createTreasurer(
        name,
        email,
        phone,
        null,
        staffData
      );
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async updateTreasurer(req, res) {
    try {
      if (req.user.role !== 'owner') {
        return res
          .status(403)
          .json({ error: 'Access denied. Only Owners can update Treasurers.' });
      }

      const { id } = req.params;
      const { name, email, phone, status } = req.body;

      // Email validation if email is being updated
      if (email) {
        const emailValidation = validateEmail(email);
        if (!emailValidation.isValid) {
          return res.status(400).json({ error: emailValidation.error });
        }
      }

      // Explicitly DO NOT extract password from body, preventing update.

      const result = await userService.updateTreasurer(id, {
        name,
        email,
        phone,
        status,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async updateProfile(req, res) {
    try {
      // Self-update only
      const id = req.user.id;
      const { name, email, phone } = req.body;

      // Email validation if email is being updated
      if (email) {
        const emailValidation = validateEmail(email);
        if (!emailValidation.isValid) {
          return res.status(400).json({ error: emailValidation.error });
        }
      }

      const result = await userService.updateUserProfile(id, {
        name,
        email,
        phone,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async deleteTreasurer(req, res) {
    try {
      if (req.user.role !== 'owner') {
        return res
          .status(403)
          .json({ error: 'Access denied. Only Owners can delete Treasurers.' });
      }

      const { id } = req.params;
      const result = await userService.deleteTreasurer(id);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getTreasurers(req, res) {
    try {
      if (req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const result = await userService.getTreasurers();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  //  GET TENANTS: Fetches the list of people living in the properties.
  //  - Owner sees EVERYONE.
  //  - Treasurer sees only tenants in properties assigned to them.
  async getTenants(req, res) {
    try {
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      console.log(
        `[DEBUG] getTenants called by ${req.user.role} ${req.user.id}`
      );

      let result;
      if (req.user.role === 'owner') {
        result = await userService.getTenants(req.user.id);
      } else if (req.user.role === 'treasurer') {
        result = await userService.getTenants(null, req.user.id);
      }

      console.log(`[DEBUG] getTenants found ${result.length} tenants.`);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getUserById(req, res) {
    try {
      const { id } = req.params;
      // RBAC: Owner can view anyone, Users can view themselves.
      // Simplified: Owner only for now as requested feature is for Owner view.
      if (req.user.role !== 'owner' && req.user.id !== parseInt(id)) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      const user = await userService.getUserById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  //  ASSIGN PROPERTY: Owner tells a Treasurer "You are responsible for this Building".
  async assignProperty(req, res) {
    try {
      if (req.user.role !== 'owner') {
        return res
          .status(403)
          .json({ error: 'Access denied. Only Owners can assign properties.' });
      }
      const { userId, propertyId } = req.body;
      await staffModel.assignProperty(userId, propertyId);
      res.json({ message: 'Property assigned successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async removeProperty(req, res) {
    try {
      if (req.user.role !== 'owner') {
        return res
          .status(403)
          .json({
            error:
              'Access denied. Only Owners can remove property assignments.',
          });
      }
      const { userId, propertyId } = req.params;
      await staffModel.removePropertyAssignment(userId, propertyId);
      res.json({ message: 'Property assignment removed' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getAssignedProperties(req, res) {
    try {
      if (req.user.role !== 'owner' && req.user.role !== 'treasurer') {
        // Treasurers can see their own assignments? Maybe. Owner is key.
        return res.status(403).json({ error: 'Access denied.' });
      }
      const { userId } = req.params;
      // Access control: Owner can see anyone's. Treasurer can only see their own.
      if (req.user.role === 'treasurer' && parseInt(userId) !== req.user.id) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      console.log(`[DEBUG] Fetching assignments for user ${userId}`);
      const properties = await staffModel.getAssignedProperties(userId);
      console.log(
        `[DEBUG] Found ${properties.length} assignments for user ${userId}`
      );
      res.json(properties);
    } catch (error) {
      console.error('[DEBUG] Error fetching assignments:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

export default new UserController();
