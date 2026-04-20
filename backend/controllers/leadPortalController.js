import leadPortalService from '../services/leadPortalService.js';
import catchAsync from '../utils/catchAsync.js';

// ============================================================================
//  LEAD PORTAL CONTROLLER (The Prospect Dashboard)
// ============================================================================
//  Dedicated to guest applicant access to their inquiry status and chat.
//  Delegates all orchestration to leadPortalService.
// ============================================================================

class LeadPortalController {
  // GET PORTAL DATA: Returns lead profile, property details, unit details, and active lease.
  getPortalData = catchAsync(async (req, res) => {
    const { token } = req.query;

    // 1. [SECURITY] Token Validation: Hydrate the full guest experience based on an opaque magic link
    const data = await leadPortalService.getPortalContext(token);

    res.json(data);
  });

  // GET MESSAGES: Returns all messages for the lead's chat thread.
  getMessages = catchAsync(async (req, res) => {
    const { token } = req.query;

    // 1. [DELEGATION] Narrative Resolver: Retrieve the unauthenticated conversation history
    const messages = await leadPortalService.getMessages(token);

    res.json(messages);
  });

  // SEND MESSAGE: Send a message as the lead.
  sendMessage = catchAsync(async (req, res) => {
    const { token } = req.query;
    const { content } = req.body;

    // 1. [DELEGATION] Contextual Dispatch: Route the message and notify staff
    const result = await leadPortalService.sendMessage(token, content);

    res.status(201).json(result);
  });

  // UPDATE PREFERENCES: Updates lead's move-in date and preferred term.
  updatePreferences = catchAsync(async (req, res) => {
    const { token } = req.query;

    // 1. [DELEGATION] Interest Refinement: Update the target unit or start date context
    const result = await leadPortalService.updatePreferences(token, req.body);

    res.json(result);
  });
}

export default new LeadPortalController();
