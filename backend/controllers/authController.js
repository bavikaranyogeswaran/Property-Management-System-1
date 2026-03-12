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
      let tenantData = req.body.tenantData;

      // Handle multipart/form-data where tenantData might be a JSON string
      if (typeof tenantData === 'string') {
        try {
          tenantData = JSON.parse(tenantData);
        } catch (e) {
          console.error('Failed to parse tenantData JSON:', e);
        }
      }

      // If a file was uploaded, add its path to tenantData
      if (req.file) {
        tenantData = tenantData || {};
        tenantData.nicUrl = `/uploads/${req.file.filename}`;
      }

      const result = await authService.setupPassword(token, password, tenantData);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}

export default new AuthController();
