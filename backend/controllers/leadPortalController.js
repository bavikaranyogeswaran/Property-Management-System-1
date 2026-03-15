import leadModel from '../models/leadModel.js';
import leadTokenModel from '../models/leadTokenModel.js';
import messageModel from '../models/messageModel.js';
import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';

class LeadPortalController {
  /**
   * GET /api/lead-portal?token=xxx
   * Returns lead profile, property details, and unit details.
   */
  async getPortalData(req, res) {
    try {
      const { token } = req.query;
      if (!token) {
        return res.status(400).json({ error: 'Access token is required' });
      }

      const tokenRecord = await leadTokenModel.findByToken(token);
      if (!tokenRecord) {
        return res.status(401).json({ error: 'Invalid or expired access link. Please contact the property owner for a new link.' });
      }

      const lead = await leadModel.findById(tokenRecord.leadId);
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      // Fetch property details
      let property = null;
      if (lead.propertyId) {
        try {
          property = await propertyModel.findById(lead.propertyId);
        } catch (e) {
          console.error('Failed to load property for portal', e);
        }
      }

      // Fetch unit details
      let unit = null;
      if (lead.interestedUnit) {
        try {
          unit = await unitModel.findById(lead.interestedUnit);
        } catch (e) {
          console.error('Failed to load unit for portal', e);
        }
      }

      res.json({
        lead: {
          id: lead.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          status: lead.status,
          propertyId: lead.propertyId,
          interestedUnit: lead.interestedUnit,
          createdAt: lead.createdAt,
          moveInDate: lead.move_in_date,
          preferredTermMonths: lead.preferred_term_months,
        },
        property: property ? {
          name: property.name,
          street: property.street,
          city: property.city,
          district: property.district,
        } : null,
        unit: unit ? {
          unitNumber: unit.unitNumber,
          type: unit.type || unit.typeName,
          monthlyRent: unit.monthlyRent,
        } : null,
      });
    } catch (error) {
      console.error('Error in getPortalData:', error);
      res.status(500).json({ error: 'Failed to load portal data' });
    }
  }

  /**
   * GET /api/lead-portal/messages?token=xxx
   * Returns all messages for the lead's chat thread.
   */
  async getMessages(req, res) {
    try {
      const { token } = req.query;
      if (!token) {
        return res.status(400).json({ error: 'Access token is required' });
      }

      const tokenRecord = await leadTokenModel.findByToken(token);
      if (!tokenRecord) {
        return res.status(401).json({ error: 'Invalid or expired access link' });
      }

      const messages = await messageModel.findByLeadId(tokenRecord.leadId);
      res.json(messages);
    } catch (error) {
      console.error('Error in portal getMessages:', error);
      res.status(500).json({ error: 'Failed to load messages' });
    }
  }

  /**
   * POST /api/lead-portal/messages?token=xxx
   * Send a message as the lead. Uses the lead's user_id as sender_id.
   */
  async sendMessage(req, res) {
    try {
      const { token } = req.query;
      const { content } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'Access token is required' });
      }
      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      const tokenRecord = await leadTokenModel.findByToken(token);
      if (!tokenRecord) {
        return res.status(401).json({ error: 'Invalid or expired access link' });
      }

      const lead = await leadModel.findById(tokenRecord.leadId);
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      if (lead.status === 'dropped') {
        return res.status(403).json({ error: 'This inquiry has been closed. You cannot send messages.' });
      }

      // Use the lead's own ID as the sender (leads are guests, not users)
      const messageId = await messageModel.create(
        tokenRecord.leadId,
        null,              // no user sender_id
        content.trim(),
        'lead',            // sender_type
        lead.id            // sender_lead_id
      );

      // Update last contacted
      await leadModel.update(tokenRecord.leadId, { lastContactedAt: new Date() });

      res.status(201).json({
        id: messageId,
        leadId: tokenRecord.leadId,
        senderLeadId: lead.id,
        senderType: 'lead',
        content: content.trim(),
        createdAt: new Date(),
        isRead: false,
        senderName: lead.name,
        senderRole: 'lead',
      });
    } catch (error) {
      console.error('Error in portal sendMessage:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }

  /**
   * PUT /api/lead-portal/preferences?token=xxx
   * Updates lead's move-in date and preferred term.
   */
  async updatePreferences(req, res) {
    try {
      const { token } = req.query;
      const { moveInDate, preferredTermMonths } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'Access token is required' });
      }

      const tokenRecord = await leadTokenModel.findByToken(token);
      if (!tokenRecord) {
        return res.status(401).json({ error: 'Invalid or expired access link' });
      }

      await leadModel.update(tokenRecord.leadId, {
        move_in_date: moveInDate,
        preferred_term_months: preferredTermMonths
      });

      res.json({ message: 'Preferences updated successfully' });
    } catch (error) {
      console.error('Error updating portal preferences:', error);
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  }
}

export default new LeadPortalController();
