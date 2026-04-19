// ============================================================================
//  LEAD CONTROLLER (The Receptionist)
// ============================================================================
//  This file handles the first contact with potential tenants.
//  It manages inquiries, property visits, and the conversion from
//  a "Lead" (prospect) to a "Tenant" (resident).
// ============================================================================

import leadService from '../services/leadService.js';
import userService from '../services/userService.js';
import leadModel from '../models/leadModel.js';
import unitModel from '../models/unitModel.js';

class LeadController {
  // CONVERT LEAD: The critical transition. Turns a prospect into a tenant and starts their lease.
  async convertLead(req, res) {
    try {
      if (req.user.role !== 'owner') {
        return res
          .status(403)
          .json({ error: 'Access denied. Only Owners can convert leads.' });
      }

      const { id } = req.params;

      // Verify the lead belongs to this owner's property
      const isOwner = await leadModel.verifyOwnership(id, req.user.id);
      if (!isOwner) {
        return res.status(403).json({
          error: 'Access denied. This lead does not belong to your property.',
        });
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

      // [HARDENING] Verify target unit belongs to the lead's property
      const lead = await leadModel.findById(id);
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found.' });
      }

      const targetUnitId = unitId || lead.interestedUnit;
      if (targetUnitId) {
        const unit = await unitModel.findById(targetUnitId);
        if (!unit) {
          return res.status(404).json({ error: 'Target unit not found.' });
        }
        if (
          unit.propertyId !== lead.propertyId &&
          unit.property_id !== lead.property_id
        ) {
          return res.status(400).json({
            error: "Target unit does not belong to the lead's property.",
          });
        }
      }

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
        {
          ...tenantData,
          documentUrl: req.body.documentUrl,
        },
        req.user
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

  // CREATE LEAD: Records a new inquiry from the website.
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
      if (
        error.message.includes('required') ||
        error.message.includes('Invalid') ||
        error.message.includes('Cannot express interest')
      ) {
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
      const history = await leadService.getLeadStageHistory(req.user);
      res.json(history);
    } catch (error) {
      if (error.message.includes('Access denied')) {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  }

  async resendPortalLink(req, res) {
    try {
      const { id } = req.params;
      const result = await leadService.resendPortalLink(id, req.user);
      res.json(result);
    } catch (error) {
      if (error.message.includes('Access denied')) {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  }

  async getFollowups(req, res) {
    try {
      const { id } = req.params;
      const followups = await leadService.getFollowups(id, req.user);
      res.json(followups);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  // CREATE FOLLOW-UP: Staff records a phone call or email sent to the prospect.
  async createFollowup(req, res) {
    try {
      const { id } = req.params;
      const followupId = await leadService.createFollowup(
        id,
        req.body,
        req.user
      );
      res.status(201).json({ id: followupId, message: 'Follow-up created' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}

export default new LeadController();
