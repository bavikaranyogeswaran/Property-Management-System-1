import notificationModel from '../models/notificationModel.js';

class NotificationController {
    async getNotifications(req, res) {
        try {
            const userId = req.user.id;
            const notifications = await notificationModel.findByUserId(userId);
            res.json(notifications);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch notifications' });
        }
    }

    async markAsRead(req, res) {
        try {
            const { id } = req.params;
            const success = await notificationModel.markAsRead(id);
            if (success) {
                res.json({ message: 'Notification marked as read' });
            } else {
                res.status(404).json({ error: 'Notification not found' });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to update notification' });
        }
    }
}

export default new NotificationController();
