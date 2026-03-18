
import visitService from '../services/visitService.js';

class VisitController {
  /**
   * Schedule a new visit.
   * Looks up existing lead by email/phone or creates a new one.
   */
  async scheduleVisit(req, res) {
    try {
      const result = await visitService.scheduleVisit(req.body);

      res.status(201).json({
        message: `Visit scheduled successfully for ${result.roundedTime}`,
        ...result,
      });
    } catch (error) {
      console.error('Error scheduling visit:', error);
      const isBusinessError = 
        error.message.includes('Missing') || 
        error.message.includes('booked') || 
        error.message.includes('not available') || 
        error.message.includes('advance');
        
      if (isBusinessError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to schedule visit' });
    }
  }

  async cancelVisit(req, res) {
    try {
      const { id } = req.params;
      await visitService.cancelVisit(id, req.user);
      res.json({ message: 'Visit cancelled successfully' });
    } catch (error) {
      console.error('Error cancelling visit:', error);
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Visit not found' });
      }
      res.status(500).json({ error: 'Failed to cancel visit' });
    }
  }

  async getVisits(req, res) {
    try {
      // Assuming auth middleware puts user in req.user
      const visits = await visitService.getVisits(req.user);
      res.json(visits);
    } catch (error) {
      console.error('Error fetching visits:', error);
      res.status(500).json({ error: 'Failed to fetch visits' });
    }
  }

  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      await visitService.updateStatus(id, status, req.user);
      res.json({ message: 'Visit status updated' });
    } catch (error) {
      console.error('Error updating visit status:', error);
      if (error.message.includes('Invalid status')) {
           return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('not found')) {
           return res.status(404).json({ error: 'Visit not found' });
      }
      res.status(500).json({ error: 'Failed to update status' });
    }
  }
}

export default new VisitController();
