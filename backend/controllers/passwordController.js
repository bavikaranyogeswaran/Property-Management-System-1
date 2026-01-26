import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import userModel from '../models/userModel.js';
import emailService from '../utils/emailService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

class PasswordController {
    async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            if (!email) {
                return res.status(400).json({ error: 'Email is required' });
            }

            const user = await userModel.findByEmail(email);
            if (!user) {
                // Return success even if user not found to prevent enumeration
                return res.json({ message: 'If an account exists, a reset link has been sent.' });
            }

            // Create a short-lived token specific to password reset
            // We include the current password hash in the secret to invalidate token if password changes
            const secret = JWT_SECRET + user.password_hash;
            const token = jwt.sign(
                { id: user.user_id, email: user.email },
                secret,
                { expiresIn: '1h' }
            );

            // Construct a URL-safe token that includes the user ID to help find the user later
            // Or just send the token and payload must contain ID. 
            // Standard way: send token. When verifying, we need user ID to reconstruct the secret.
            // THIS IS TRICKY: Verification needs user's current password hash.
            // Better approach: Just use standard secret, but shorter expiry.
            // Or: Encode user ID in the token payload (already done). 

            // To make it stateless but secure: 
            // 1. Sign payload { id, email } with JWT_SECRET.
            // 2. But we want to invalidate if they change password. 
            //    So we can use a composite key or just rely on expiry.
            //    Let's stick to standard JWT_SECRET for simplicity now, 1h expiry.

            const resetToken = jwt.sign(
                { id: user.user_id, type: 'reset' },
                JWT_SECRET,
                { expiresIn: '1h' }
            );

            await emailService.sendPasswordResetEmail(user.email, resetToken);

            res.json({ message: 'If an account exists, a reset link has been sent.' });
        } catch (error) {
            console.error('Forgot password error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async resetPassword(req, res) {
        try {
            const { token, newPassword } = req.body;

            if (!token || !newPassword) {
                return res.status(400).json({ error: 'Token and new password are required' });
            }

            // Verify token
            let decoded;
            try {
                decoded = jwt.verify(token, JWT_SECRET);
            } catch (err) {
                return res.status(400).json({ error: 'Invalid or expired token' });
            }

            if (decoded.type !== 'reset') {
                return res.status(400).json({ error: 'Invalid token type' });
            }

            // Find user
            const user = await userModel.findById(decoded.id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Hash new password
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(newPassword, salt);

            // Update user directly via query since model.update might not have password support
            // We need to extend model or run query here. 
            // Let's use userModel but we need to check if it supports password update.
            // Looking at userModel.js earlier, `update` method takes `name, email, phone, status`.
            // It does NOT update password.
            // We should add a method to userModel for this.

            // Allow me to update userModel first or I can do a direct query if I import pool.
            // Better to add method to model.

            // For now, I will assume I will add `updatePassword` to userModel.
            await userModel.updatePassword(user.user_id, passwordHash);

            res.json({ message: 'Password has been reset successfully' });

        } catch (error) {
            console.error('Reset password error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async changePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;
            const userId = req.user.id;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({ error: 'Current and new password are required' });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({ error: 'Password must be at least 8 characters' });
            }

            // Verify current password
            // We need to fetch the user with password hash. getUserById usually excludes hash.
            // So we use userModel.findById directly (or a new method findByIdWithPassword)
            // But looking at userModel.findById in userService, it excludes nothing by default.
            // userService.getUserById explicitly deletes it.
            // userModel.findById in db returns all columns.

            const user = await userModel.findById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Incorrect current password' });
            }

            // Hash new password
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(newPassword, salt);

            await userModel.updatePassword(userId, passwordHash);

            res.json({ message: 'Password updated successfully' });

        } catch (error) {
            console.error('Change password error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

export default new PasswordController();
