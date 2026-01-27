import authService from '../services/authService.js';
import { validatePassword, validateEmail } from '../utils/validators.js';

class AuthController {
    async login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            // Email validation
            const emailValidation = validateEmail(email);
            if (!emailValidation.isValid) {
                return res.status(400).json({ error: emailValidation.error });
            }

            const result = await authService.login(email, password);
            res.json(result);
        } catch (error) {
            res.status(401).json({ error: error.message });
        }
    }
    async verifyEmail(req, res) {
        try {
            const { token } = req.body;
            if (!token) return res.status(400).json({ error: 'Token is required' });

            const result = await authService.verifyEmail(token);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async setupPassword(req, res) {
        try {
            const { token, password } = req.body;
            if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });

            // Password strength validation
            const passwordValidation = validatePassword(password);
            if (!passwordValidation.isValid) {
                return res.status(400).json({
                    error: 'Password does not meet security requirements',
                    details: passwordValidation.errors
                });
            }

            const result = await authService.setupPassword(token, password);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

export default new AuthController();
