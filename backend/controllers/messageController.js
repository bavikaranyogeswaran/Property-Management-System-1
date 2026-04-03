import messageModel from '../models/messageModel.js';
import leadModel from '../models/leadModel.js';

class MessageController {
  async sendMessage(req, res) {
    try {
      const { leadId } = req.params;
      const { content } = req.body;
      const senderId = req.user.id;

      if (!content) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      // Verify lead exists
      const lead = await leadModel.findById(leadId);
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      // Authorization: Only owners and admins can send messages via JWT-protected route
      if (req.user.role !== 'owner' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const messageId = await messageModel.create({
        leadId,
        senderId,
        content,
        senderType: 'user'
      });

      // Update last contacted
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

  async getMessages(req, res) {
    try {
      const { leadId } = req.params;
      const lead = await leadModel.findById(leadId);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      if (req.user.role !== 'owner' && req.user.role !== 'admin' && req.user.role !== 'tenant') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const messages = await messageModel.findByLeadId(leadId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async markRead(req, res) {
    try {
      const { leadId } = req.params;
      await messageModel.markAllAsRead(leadId, req.user.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // --- TENANT SPECIFIC ENDPOINTS ---

  // For tenant fetching their own messages
  async getTenantMessages(req, res) {
    try {
      const tenantId = req.user.role === 'tenant' ? req.user.id : req.params.tenantId;
      const messages = await messageModel.findByTenantId(tenantId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // For anyone sending a message in a tenant thread
  async sendTenantMessage(req, res) {
    try {
      const tenantId = req.user.role === 'tenant' ? req.user.id : req.params.tenantId;
      const { content } = req.body;
      const senderId = req.user.id;

      if (!content) return res.status(400).json({ error: 'Message content required' });

      const messageId = await messageModel.create({
        tenantId,
        senderId,
        content,
        senderType: 'user'
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
        senderName: req.user.name || 'User'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async markTenantRead(req, res) {
    try {
      const tenantId = req.user.role === 'tenant' ? req.user.id : req.params.tenantId;
      await messageModel.markAllAsReadForTenant(tenantId, req.user.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new MessageController();
