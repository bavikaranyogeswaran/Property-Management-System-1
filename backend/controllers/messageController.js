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
            // Verify lead exists
            const lead = await leadModel.findById(leadId);
            if (!lead) {
                return res.status(404).json({ error: 'Lead not found' });
            }

            console.log(`[DEBUG] sendMessage: Request by ${req.user.email} (${req.user.role}) to lead ${leadId} (Lead Email: ${lead.email})`);

            // Authorization
            if (req.user.role === 'lead') {
                const leadEmail = lead.email ? lead.email.toLowerCase() : '';
                const userEmail = req.user.email ? req.user.email.toLowerCase() : '';

                if (leadEmail !== userEmail) {
                    console.error('[DEBUG] Access denied: Lead email mismatch');
                    return res.status(403).json({
                        error: `Access denied: Email mismatch. You are '${req.user.role}' (${userEmail}). Lead is (${leadEmail}).`
                    });
                }
            } else if (req.user.role !== 'owner' && req.user.role !== 'admin') {
                console.error(`[DEBUG] Access denied: Role ${req.user.role} not authorized`);
                return res.status(403).json({ error: 'Access denied' });
            }

            const messageId = await messageModel.create(leadId, senderId, content);
            console.log(`[DEBUG] Message created with ID: ${messageId}`);



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
                const leadEmail = lead.email ? lead.email.toLowerCase() : '';
                const userEmail = req.user.email ? req.user.email.toLowerCase() : '';
                if (leadEmail !== userEmail) {
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
