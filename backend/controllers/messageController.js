// ============================================================================
//  MESSAGE CONTROLLER (The Post Office)
// ============================================================================
//  This file handles all direct communication between staff and tenants/leads.
//  It records the history of conversations and marks them as read.
// ============================================================================

import messageModel from '../models/messageModel.js';
import leadModel from '../models/leadModel.js';

class MessageController {
  // SEND MESSAGE: Dispatches a new note to a Lead (prospect).
  async sendMessage(req, res) {
    try {
      const { leadId } = req.params;
      const { content } = req.body;
      const senderId = req.user.id;

      // 1. [VALIDATION] Integrity Guard
      if (!content)
        return res.status(400).json({ error: 'Message content is required' });

      // 2. [DATA] Verification: Ensure the recipient exists
      const lead = await leadModel.findById(leadId);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      // 3. [DATA] Persistence: Record the outbound communication
      const messageId = await messageModel.create({
        leadId,
        senderId,
        content,
        senderType: 'user',
      });

      // 4. [SIDE EFFECT] CRM logic: Update the "Last Contacted" timestamp to keep the lead pipeline fresh
      await leadModel.update(leadId, { lastContactedAt: new Date() });

      const newMessage = {
        id: messageId,
        leadId,
        senderId,
        senderType: 'user',
        content,
        createdAt: new Date(),
        isRead: false,
      };

      res.status(201).json(newMessage);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // GET MESSAGES: Retrieves the chat history for a specific Lead.
  async getMessages(req, res) {
    try {
      const { leadId } = req.params;
      const lead = await leadModel.findById(leadId);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      // 1. [DATA] Conversation retrieval: Fetch all notes in the prospect's thread
      const messages = await messageModel.findByLeadId(leadId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // MARK READ: Updates the status of all messages in a lead thread.
  async markRead(req, res) {
    try {
      const { leadId } = req.params;
      // 1. [DATA] Bulk status update
      await messageModel.markAllAsRead(leadId, req.user.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // --- TENANT SPECIFIC ENDPOINTS ---

  // GET TENANT MESSAGES: Retrieves the chat history for a verified Tenant.
  async getTenantMessages(req, res) {
    try {
      // 1. [SECURITY] ID Resolution: Use session ID for tenants, or URL param for staff/owners
      const tenantId =
        req.user.role === 'tenant' ? req.user.id : req.params.tenantId;

      // 2. [DATA] Narrative Resolver
      const messages = await messageModel.findByTenantId(tenantId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // SEND TENANT MESSAGE: Dispatches a new note into a verified Tenant's thread.
  async sendTenantMessage(req, res) {
    try {
      // 1. [SECURITY] ID Resolution
      const tenantId =
        req.user.role === 'tenant' ? req.user.id : req.params.tenantId;
      const { content } = req.body;
      const senderId = req.user.id;

      if (!content)
        return res.status(400).json({ error: 'Message content required' });

      // 2. [DATA] Persistence
      const messageId = await messageModel.create({
        tenantId,
        senderId,
        content,
        senderType: 'user',
      });

      res.status(201).json({
        id: messageId,
        tenantId,
        senderId,
        senderType: 'user',
        content,
        createdAt: new Date(),
        isRead: false,
        senderRole: req.user.role,
        senderName: req.user.name || 'User',
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // MARK TENANT READ: Specifically marks the verified tenant's conversation as seen.
  async markTenantRead(req, res) {
    try {
      // 1. [SECURITY] Context selection
      const tenantId =
        req.user.role === 'tenant' ? req.user.id : req.params.tenantId;

      // 2. [DATA] Atomic update
      await messageModel.markAllAsReadForTenant(tenantId, req.user.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new MessageController();
