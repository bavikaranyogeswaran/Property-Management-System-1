// ============================================================================
//  AUTH CONTROLLER (The Security Guard)
// ============================================================================
//  This file handles all "Entry" requests: Logging in, Setting passwords, etc.
//  It verifies who you are before letting you into the system.
// ============================================================================

import authService from '../services/authService.js';
import { validatePassword, validateEmail } from '../utils/validators.js';

class AuthController {
  //  LOGIN: Checks email & password. If correct, gives a digital "Key" (Token).
  async login(req, res) {
    try {
      const { email, password } = req.body;

      const result = await authService.login(email, password);
      res.json(result);
    } catch (error) {
      res.status(401).json({ error: error.message });
    }
  }
  async verifyEmail(req, res) {
    try {
      const { token } = req.body;

      const result = await authService.verifyEmail(token);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async setupPassword(req, res) {
    try {
      const { token, password } = req.body;

      const result = await authService.setupPassword(token, password);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}

export default new AuthController();
