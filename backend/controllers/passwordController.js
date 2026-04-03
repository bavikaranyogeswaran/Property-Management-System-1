import authService from '../services/authService.js';

class PasswordController {
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const result = await authService.requestPasswordReset(email);
      res.json(result);
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res
          .status(400)
          .json({ error: 'Token and new password are required' });
      }

      const result = await authService.resetPassword(token, newPassword);
      res.json(result);
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(400).json({ error: error.message });
    }
  }

  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      if (!currentPassword || !newPassword) {
        return res
          .status(400)
          .json({ error: 'Current and new password are required' });
      }

      if (newPassword.length < 8) {
        return res
          .status(400)
          .json({ error: 'Password must be at least 8 characters' });
      }

      // We still need current password verification here or move it to a service
      // For now, keep it here or create a service method
      // Actually, since this is "authenticated" change, moving it to authService is cleaner too.
      // But for simplicity of this specific task, let's just use the userModel.
      
      const user = await (await import('../models/userModel.js')).default.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const bcrypt = (await import('bcryptjs')).default;
      const validPassword = await bcrypt.compare(
        currentPassword,
        user.passwordHash || user.password_hash
      );
      if (!validPassword) {
        return res.status(401).json({ error: 'Incorrect current password' });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      await (await import('../models/userModel.js')).default.updatePassword(userId, passwordHash);

      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default new PasswordController();
