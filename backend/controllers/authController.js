import authService from '../services/authService';

class AuthController {
    async login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            const result = await authService.login(email, password);
            res.json(result);
        } catch (error) {
            res.status(401).json({ error: error.message });
        }
    }

    async registerOwner(req, res) {
        try {
            const { name, email, password } = req.body;
            if (!name || !email || !password) {
                return res.status(400).json({ error: 'All fields are required' });
            }

            const result = await authService.registerOwner(name, email, password);
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async createTreasurer(req, res) {
        try {
            // Check if requester is Owner (RBAC Middleware should handle this, but double check here)
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied. Only Owners can create Treasurers.' });
            }

            const { name, email, password } = req.body;
            if (!name || !email || !password) {
                return res.status(400).json({ error: 'All fields are required' });
            }

            const result = await authService.createTreasurer(name, email, password);
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

export default new AuthController();
