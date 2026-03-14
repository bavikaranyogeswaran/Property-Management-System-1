
import behaviorService from '../services/behaviorService.js';

export const addBehaviorLog = async (req, res) => {
  const { tenantId } = req.params;
  const { type, category, scoreChange, description, recordedBy } = req.body;

  try {
     const newScore = await behaviorService.addBehaviorLog({
         type, category, scoreChange, description, recordedBy
     }, tenantId);
 
    res.status(201).json({
      message: 'Behavior log added successfully',
      newScore,
    });
  } catch (error) {
    console.error('Error adding behavior log:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getTenantBehavior = async (req, res) => {
  const { tenantId } = req.params;

  try {
    const result = await behaviorService.getTenantBehavior(tenantId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching tenant behavior:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getMyBehavior = async (req, res) => {
  const tenantId = req.user.user_id; // Identifies the authenticated tenant

  try {
    const result = await behaviorService.getTenantBehavior(tenantId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching own behavior:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
