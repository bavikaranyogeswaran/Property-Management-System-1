import userService from '../services/userService.js';
import leadModel from '../models/leadModel.js';
import leadStageHistoryModel from '../models/leadStageHistoryModel.js';
import unitModel from '../models/unitModel.js';
import propertyModel from '../models/propertyModel.js';
import userModel from '../models/userModel.js';
import emailService from '../utils/emailService.js';
import {
  validatePassword,
  validateEmail,
  validatePhoneNumber,
} from '../utils/validators.js';

class LeadController {
  async convertLead(req, res) {
    try {
      // Check if user is owner (RBAC)
      if (req.user.role !== 'owner') {
        return res
          .status(403)
          .json({ error: 'Access denied. Only Owners can convert leads.' });
      }

      const { id } = req.params;
      const {
        startDate,
        endDate,
        nic,
        permanentAddress,
        employerName,
        monthlyIncome,
        unitId,
      } = req.body;

      const tenantData = {
        nic,
        permanentAddress,
        employerName,
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
      if (req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      console.log(
        `[DEBUG] getLeads called by UserID: ${req.user.id}, Role: ${req.user.role}`
      );
      // Filter leads by this owner's properties
      const leads = await leadModel.findAll(req.user.id);
      console.log(`[DEBUG] getLeads found ${leads.length} leads.`);
      res.json(leads);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getMyLead(req, res) {
    try {
      const email = req.user.email;
      console.log(`[DEBUG] getMyLead: Fetching profile for email '${email}'`);

      // Use model method
      const myLead = await leadModel.findByEmail(email);

      if (!myLead) {
        console.log(`[DEBUG] No lead profile found for email: '${email}'`);
        // Check if any lead exists even if dropped, for debugging
        // We can just rely on not found here or add countByEmail if critical.
        // For now, simple 404 is fine or just return error as before.
        // User wanted strict Model usage.
        
        return res.status(404).json({
          error: `Lead profile not found for email: ${email}`,
        });
      }

      console.log(`[DEBUG] Found lead profile: ${myLead.id}`);
      res.json(myLead);
    } catch (error) {
      console.error('Error in getMyLead:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async createLead(req, res) {
    try {
      // Public endpoint - no role check needed

      const { name, email, phone, propertyId, interestedUnit, unitId, notes } =
        req.body;
      // Password is NO LONGER required for "I'm Interested"

      if (!name || !email || !propertyId) {
        return res
          .status(400)
          .json({ error: 'Name, email, and property are required' });
      }

      // Email validation
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        return res.status(400).json({ error: emailValidation.error });
      }

      // Phone number validation (optional but good)
      if (phone) {
        const phoneValidation = validatePhoneNumber(phone);
        if (!phoneValidation.isValid) {
          return res.status(400).json({ error: phoneValidation.error });
        }
      }

      // STRICT VALIDATION: Check if unit belongs to property
      let finalUnitId = unitId || interestedUnit;

      if (finalUnitId && finalUnitId !== '' && finalUnitId !== 'null') {
        const unitCheck = await unitModel.findById(finalUnitId);

        if (!unitCheck) {
          return res.status(400).json({ error: 'Invalid unit selected' });
        }

        if (String(unitCheck.propertyId) !== String(propertyId)) {
          return res
            .status(400)
            .json({
              error: 'Selected unit does not belong to the specified property',
            });
        }
      } else {
        finalUnitId = null;

        // NEW CHECK: If "Whole Property" interest (no specific unit), check if any units are OCCUPIED.
        const occupiedCount = await unitModel.countOccupied(propertyId);

        if (occupiedCount > 0) {
          return res.status(400).json({
            error:
              'Cannot express interest in the whole property because some units are currently occupied. Please select a specific unit.',
          });
        }
      }

      // NEW CHECK: Check if a USER account already exists with this email.
      // If yes, we block lead creation to prevent duplicate/merged identities.
      const existingUser = await userModel.findByEmail(email);
      if (existingUser) {
        return res
          .status(409)
          .json({
            error:
              'This email is already associated with an account. Please log in or contact the property owner.',
          });
      }

      // CHECK ARBITRATION:
      // Instead of creating a USER account, we check if a LEAD exists.

      // 1. Check if ANY lead exists with this email (across any property? or just this one?)
      // Usually, a "Lead" is per-property interest in some systems, or a "Person" in others.
      // In this DB schema, `leads` table has `property_id`. So one person can be a lead for multiple properties.
      // However, we don't want to create duplicates if they inquire about the SAME property twice.

      const existingLeadId = await leadModel.findIdByEmailAndProperty(
        email,
        propertyId
      );

      let leadId;
      if (existingLeadId) {
        // Lead exists for this property -> Update it (e.g. new notes, timestamp)
        leadId = existingLeadId;
        await leadModel.update(leadId, {
          lastContactedAt: new Date(),
          notes: notes ? `${notes} (Re-inquiry)` : undefined,
          // potentially update unit if they changed mind?
        });

        // Send Confirmation Email for re-inquiry
        try {
          const property = await propertyModel.findById(propertyId);
          const propertyName = property ? property.name : 'our property';
          await emailService.sendWelcomeLead(email, name, propertyName); // name from request might differ from DB, but we use current request name
        } catch (emailErr) {
          console.error(
            'Failed to send re-inquiry confirmation email',
            emailErr
          );
        }

        return res
          .status(200)
          .json({
            id: leadId,
            message: 'Interest updated. We will contact you soon.',
          });
      } else {
        // Create NEW Lead (No User Account yet)
        leadId = await leadModel.create({
          propertyId,
          unitId: finalUnitId,
          interestedUnit: finalUnitId,
          name,
          phone,
          email,
          notes,
          status: 'interested',
          userId: null, // No user account
        });

        // Send Confirmation Email
        try {
          // Fetch property Name for the email
          const property = await propertyModel.findById(propertyId);
          const propertyName = property ? property.name : 'our property';
          await emailService.sendWelcomeLead(email, name, propertyName);
        } catch (emailErr) {
          console.error('Failed to send interest confirmation email', emailErr);
        }

        return res
          .status(201)
          .json({
            id: leadId,
            message: 'Interest registered! We will contact you soon.',
          });
      }
    } catch (error) {
      console.error('Error creating lead:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async updateLead(req, res) {
    try {
      if (req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const { id } = req.params;
      const success = await leadModel.update(id, req.body);
      if (!success) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      res.json({ message: 'Lead updated successfully' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getLeadStageHistory(req, res) {
    try {
      if (req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      // Filter history by owner's leads
      const history = await leadStageHistoryModel.findAll(req.user.id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new LeadController();
