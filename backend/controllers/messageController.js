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
      // Leads use the portal (token-based) to send messages, not this endpoint
      if (req.user.role !== 'owner' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const messageId = await messageModel.create(leadId, senderId, content, 'user');

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

      // Verify lead exists
      const lead = await leadModel.findById(leadId);
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      // Authorization: owners, admins, and tenants can view messages
      if (
        req.user.role !== 'owner' &&
        req.user.role !== 'admin' &&
        req.user.role !== 'tenant'
      ) {
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
}

export default new MessageController();
