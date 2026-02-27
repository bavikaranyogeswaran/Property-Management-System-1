
import leadService from '../services/leadService.js';
import userService from '../services/userService.js';

class LeadController {
  async convertLead(req, res) {
    try {
      if (req.user.role !== 'owner') {
        return res
          .status(403)
          .json({ error: 'Access denied. Only Owners can convert leads.' });
      }

      const { id } = req.params;

      // Verify the lead belongs to this owner's property
      const leadModel = (await import('../models/leadModel.js')).default;
      const isOwner = await leadModel.verifyOwnership(id, req.user.id);
      if (!isOwner) {
        return res.status(403).json({ error: 'Access denied. This lead does not belong to your property.' });
      }

      const {
        startDate,
        endDate,
        nic,
        permanentAddress,
        emergencyContactName,
        emergencyContactPhone,
        monthlyIncome,
        unitId,
      } = req.body;

      const tenantData = {
        nic,
        permanentAddress,
        emergencyContactName,
        emergencyContactPhone,
        monthlyIncome,
        unitId,
      };

      const result = await userService.convertLeadToTenant(
        id,
        startDate,
        endDate,
        tenantData
      );
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getLeads(req, res) {
    try {
      const leads = await leadService.getLeads(req.user);
      res.json(leads);
    } catch (error) {
        if (error.message.includes('Access denied')) {
            return res.status(403).json({ error: error.message });
        }
      res.status(500).json({ error: error.message });
    }
  }

  async getMyLead(req, res) {
    try {
      const email = req.user.email;
      const myLead = await leadService.getMyLead(email);

      if (!myLead) {
        return res.status(404).json({
          error: `Lead profile not found for email: ${email}`,
        });
      }
      res.json(myLead);
    } catch (error) {
      console.error('Error in getMyLead:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async createLead(req, res) {
    try {
      const result = await leadService.registerInterest(req.body);
      
      if (result.isNew) {
          res.status(201).json({ id: result.id, message: result.message });
      } else {
          res.status(200).json({ id: result.id, message: result.message });
      }
    } catch (error) {
      // Logic from service errors
      if (error.message.includes('required') || error.message.includes('Invalid') || error.message.includes('Cannot express interest')) {
           return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('already associated')) {
           return res.status(409).json({ error: error.message });
      }
      console.error('Error creating lead:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async updateLead(req, res) {
    try {
      const { id } = req.params;
      await leadService.updateLead(id, req.body, req.user);
      res.json({ message: 'Lead updated successfully' });
    } catch (error) {
        if (error.message.includes('Access denied')) {
            return res.status(403).json({ error: error.message });
        }
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
      res.status(400).json({ error: error.message });
    }
  }

  async getLeadStageHistory(req, res) {
    try {
      console.log('[DEBUG] getLeadStageHistory called by user:', req.user);
      const history = await leadService.getLeadStageHistory(req.user);
      console.log('[DEBUG] stage history result size:', history.length);
      res.json(history);
    } catch (error) {
        if (error.message.includes('Access denied')) {
            return res.status(403).json({ error: error.message });
        }
      res.status(500).json({ error: error.message });
    }
  }
}

export default new LeadController();
