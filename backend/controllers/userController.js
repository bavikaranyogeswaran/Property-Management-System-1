import userService from '../services/userService.js';

class UserController {
    async createTreasurer(req, res) {
        try {
            // RBAC Check: Only owner can create treasurer
            // Req.user is populated by authenticateToken middleware
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied. Only Owners can create Treasurers.' });
            }

            const { name, email, phone, password } = req.body;
            if (!name || !email || !password || !phone) {
                return res.status(400).json({ error: 'All fields are required' });
            }

            const result = await userService.createTreasurer(name, email, phone, password);
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async updateTreasurer(req, res) {
        try {
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied. Only Owners can update Treasurers.' });
            }

            const { id } = req.params;
            const { name, email, phone, status } = req.body;

            // Explicitly DO NOT extract password from body, preventing update.

            const result = await userService.updateTreasurer(id, { name, email, phone, status });
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async deleteTreasurer(req, res) {
        try {
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied. Only Owners can delete Treasurers.' });
            }

            const { id } = req.params;
            const result = await userService.deleteTreasurer(id);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

export default new UserController();
