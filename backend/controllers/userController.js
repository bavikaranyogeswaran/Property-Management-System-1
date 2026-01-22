import userService from '../services/userService.js';

class UserController {
    async createTreasurer(req, res) {
        try {
            // RBAC Check: Only owner can create treasurer
            // Req.user is populated by authenticateToken middleware
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied. Only Owners can create Treasurers.' });
            }

            const { name, email, password } = req.body;
            if (!name || !email || !password) {
                return res.status(400).json({ error: 'All fields are required' });
            }

            const result = await userService.createTreasurer(name, email, password);
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

export default new UserController();
