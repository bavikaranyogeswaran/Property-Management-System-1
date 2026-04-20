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
    // 1. [DELEGATION] Logging Logic: Persist the incident and recalculate the net behavior score
    const newScore = await behaviorService.addBehaviorLog(
      { type, category, scoreChange, description, recordedBy },
      tenantId
    );

    // 2. [RESPONSE] Dispatch the updated score for immediate UI feedback
    res
      .status(201)
      .json({ message: 'Behavior log added successfully', newScore });
  } catch (error) {
    console.error('Error adding behavior log:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// GET TENANT BEHAVIOR: Staff views the full history of a tenant's behavior score.
export const getTenantBehavior = async (req, res) => {
  const { tenantId } = req.params;

  try {
    // 1. [DELEGATION] History Resolver: Fetch all logs and the current aggregate score
    const result = await behaviorService.getTenantBehavior(tenantId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching tenant behavior:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// GET MY BEHAVIOR: Let's a tenant see their own standing and recent logs.
export const getMyBehavior = async (req, res) => {
  // 1. [SECURITY] Identify the caller from the session token
  const tenantId = req.user.user_id;

  try {
    // 2. [DELEGATION] View Resolver
    const result = await behaviorService.getTenantBehavior(tenantId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching own behavior:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
