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

    async updateProfile(req, res) {
        try {
            // Self-update only
            const id = req.user.id;
            const { name, email, phone } = req.body;

            const result = await userService.updateUserProfile(id, { name, email, phone });
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

    async getTenants(req, res) {
        try {
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied.' });
            }
            const result = await userService.getTenants();
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
}

export default new UserController();
