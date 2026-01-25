import unitModel from '../models/unitModel.js';

class UnitController {
    async createUnit(req, res) {
        try {
            const unit = await unitModel.create(req.body);
            const newUnit = await unitModel.findById(unit);
            res.status(201).json(newUnit);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getUnits(req, res) {
        try {
            const units = await unitModel.findAll();
            res.json(units);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getUnitById(req, res) {
        try {
            const unit = await unitModel.findById(req.params.id);
            if (!unit) return res.status(404).json({ error: 'Unit not found' });
            res.json(unit);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async updateUnit(req, res) {
        try {
            const success = await unitModel.update(req.params.id, req.body);
            if (!success) return res.status(404).json({ error: 'Unit not found or no changes' });
            const updated = await unitModel.findById(req.params.id);
            res.json(updated);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async deleteUnit(req, res) {
        try {
            const success = await unitModel.delete(req.params.id);
            if (!success) return res.status(404).json({ error: 'Unit not found' });
            res.json({ message: 'Unit deleted' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

export default new UnitController();
