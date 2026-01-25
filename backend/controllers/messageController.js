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

            // Authorization: Only the lead owner (if implemented) or the lead themselves or an Admin/Owner can send
            // For now, allow Owner and the specific Lead User
            // Assuming req.user is populated by auth middleware
            if (req.user.role === 'lead') {
                // If user is a lead, they can only send to their own lead record?
                // Wait, leadModel.findById doesn't currently return the user_id linked to the lead if we didn't store it?
                // In leadController.createLead, we created a User.
                // We depend on email matching or if we link 'tenant_id' / 'user_id' in leads table.
                // Current schema: `tenant_id` INT NULL (set only when converted).
                // But we have `email`.

                // If `req.user.email` matches `lead.email`, it's them.
                if (lead.email !== req.user.email) {
                    return res.status(403).json({ error: 'Access denied' });
                }
            } else if (req.user.role !== 'owner' && req.user.role !== 'admin') {
                // Determine who can chat. Owners can chat with any lead.
                return res.status(403).json({ error: 'Access denied' });
            }

            const messageId = await messageModel.create(leadId, senderId, content);

            // If sender is Owner, update status to 'negotiation' if it's currently 'interested'
            if (req.user.role === 'owner' && lead.status === 'interested') {
                await leadModel.update(leadId, { status: 'negotiation' });
            }

            // Update last contacted
            await leadModel.update(leadId, { lastContactedAt: new Date() });

            const newMessage = {
                id: messageId,
                leadId,
                senderId,
                content,
                createdAt: new Date(),
                isRead: false
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

            // Authorization check similar to sendMessage
            const lead = await leadModel.findById(leadId);
            if (!lead) {
                return res.status(404).json({ error: 'Lead not found' });
            }

            if (req.user.role === 'lead') {
                if (lead.email !== req.user.email) {
                    // Check if this user is the "converted tenant" for this lead?
                    if (lead.tenantId !== req.user.id) {
                        return res.status(403).json({ error: 'Access denied' });
                    }
                }
            } else if (req.user.role !== 'owner' && req.user.role !== 'admin' && req.user.role !== 'tenant') {
                // Tenants can view if they were the lead
                if (req.user.role === 'tenant' && lead.tenantId !== req.user.id) {
                    return res.status(403).json({ error: 'Access denied' });
                }
                if (req.user.role !== 'tenant') { // Treasurers etc shouldn't see?
                    return res.status(403).json({ error: 'Access denied' });
                }
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
