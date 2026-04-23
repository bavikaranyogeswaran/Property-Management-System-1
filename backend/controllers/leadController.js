// ============================================================================
//  LEAD CONTROLLER (The Receptionist)
// ============================================================================
//  This file handles the first contact with potential tenants.
//  It manages inquiries, property visits, and the conversion from
//  a "Lead" (prospect) to a "Tenant" (resident).
// ============================================================================

import leadService from '../services/leadService.js';
import userService from '../services/userService.js';
import { ROLES } from '../utils/roleUtils.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

// [Q6 FIX] Removed direct model imports (leadModel, unitModel) as business logic
// has been moved to leadService.js (M2/Q6 hardening).

class LeadController {
  // CONVERT LEAD: The critical transition. Turns a prospect into a tenant and starts their lease.
  convertLead = catchAsync(async (req, res) => {
    const result = await leadService.convertLead(
      req.params.id,
      req.body,
      req.user
    );
    res.status(200).json(result);
  });

  // GET LEADS: Retrieves the pipeline of prospects (Filtered by RBAC).
  getLeads = catchAsync(async (req, res) => {
    // 1. [DELEGATION] Fetch list context-aware (Staff sees all, Owner sees theirs)
    const leads = await leadService.getLeads(req.user);
    res.json(leads);
  });

  // GET MY LEAD: Allows an authenticated guest to see their own interest profile.
  getMyLead = catchAsync(async (req, res) => {
    // 1. [SECURITY] Identification: Map session email to lead record
    const email = req.user.email;
    const myLead = await leadService.getMyLead(email);

    if (!myLead) {
      throw new AppError(`Lead profile not found for email: ${email}`, 404);
    }
    res.json(myLead);
  });

  // CREATE LEAD: Records a new inquiry from the public portal or website.
  createLead = catchAsync(async (req, res) => {
    // 1. [DELEGATION] Lead Ingestion: Register interest and potentially trigger Welcome emails
    const result = await leadService.registerInterest(req.body);

    if (result.isNew) {
      res.status(201).json({ id: result.id, message: result.message });
    } else {
      res.status(200).json({ id: result.id, message: result.message });
    }
  });

  // UPDATE LEAD: Modifies details or status (e.g., 'interested' -> 'on_site_visit').
  updateLead = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Modification
    await leadService.updateLead(id, req.body, req.user);
    res.json({ message: 'Lead updated successfully' });
  });

  // GET STAGE HISTORY: Aggregated view of how leads move through the funnel.
  getLeadStageHistory = catchAsync(async (req, res) => {
    // 1. [DELEGATION] Analytical resolver
    const history = await leadService.getLeadStageHistory(req.user);
    res.json(history);
  });

  // RESEND PORTAL LINK: Re-triggers the magic link for the Guest Portal.
  resendPortalLink = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Key Regeneration & Notification
    const result = await leadService.resendPortalLink(id, req.user);
    res.json(result);
  });

  // GET FOLLOWUPS: Lists all touchpoints recorded for a prospect.
  getFollowups = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Log retrieval
    const followups = await leadService.getFollowups(id, req.user);
    res.json(followups);
  });

  // CREATE FOLLOW-UP: Staff records a phone call or email sent to the prospect.
  createFollowup = catchAsync(async (req, res) => {
    const { id } = req.params;
    // 1. [DELEGATION] Interaction Logging: Persist the staff notes for audit/CRM tracking
    const followupId = await leadService.createFollowup(id, req.body, req.user);
    res.status(201).json({ id: followupId, message: 'Follow-up created' });
  });
}

export default new LeadController();
