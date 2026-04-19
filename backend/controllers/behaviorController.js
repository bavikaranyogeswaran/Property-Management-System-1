// ============================================================================
//  BEHAVIOR CONTROLLER (The Reputation Tracker)
// ============================================================================
//  This file manages the "social credit" score for tenants.
//  It logs good behavior (early payments) and bad behavior (noise complaints).
// ============================================================================

import behaviorService from '../services/behaviorService.js';

// ADD BEHAVIOR LOG: Staff records a positive or negative incident for a tenant.
export const addBehaviorLog = async (req, res) => {
  const { tenantId } = req.params;
  const { type, category, scoreChange, description, recordedBy } = req.body;

  try {
    const newScore = await behaviorService.addBehaviorLog(
      {
        type,
        category,
        scoreChange,
        description,
        recordedBy,
      },
      tenantId
    );

    res.status(201).json({
      message: 'Behavior log added successfully',
      newScore,
    });
  } catch (error) {
    console.error('Error adding behavior log:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// GET TENANT BEHAVIOR: Staff views the full history of a tenant's behavior score.
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

// GET MY BEHAVIOR: Let's a tenant see their own standing and recent logs.
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
