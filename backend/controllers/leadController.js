// ============================================================================
//  LEAD CONTROLLER (The Receptionist)
// ============================================================================
//  This file handles the first contact with potential tenants.
//  It manages inquiries, property visits, and the conversion from
//  a "Lead" (prospect) to a "Tenant" (resident).
// ============================================================================

import leadService from '../services/leadService.js';
import userService from '../services/userService.js';
import leadModel from '../models/leadModel.js';
import unitModel from '../models/unitModel.js';

import { ROLES } from '../utils/roleUtils.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

class LeadController {
  // CONVERT LEAD: The critical transition. Turns a prospect into a tenant and starts their lease.
  convertLead = catchAsync(async (req, res) => {
    // 1. [SECURITY] Role Guard: Only Owners can authorize the conversion of a lead to a tenant
    if (req.user.role !== ROLES.OWNER) {
      throw new AppError('Access denied. Only Owners can convert leads.', 403);
    }

    const { id } = req.params;

    // 2. [SECURITY] Ownership Verification: Ensure the lead is actually managed by the requesting owner
    const isOwner = await leadModel.verifyOwnership(id, req.user.id);
    if (!isOwner) {
      throw new AppError(
        'Access denied. This lead does not belong to your property.',
        403
      );
    }

    const {
      startDate,
      endDate,
      nic,
      permanentAddress,
      emergencyContactName,
      emergencyContactPhone,
      monthlyIncome,
      unitId,
    } = req.body;

    // 3. [VALIDATION] Context check: Ensure the lead exists and the target unit is within the same property
    const lead = await leadModel.findById(id);
    if (!lead) {
      throw new AppError('Lead not found.', 404);
    }

    const targetUnitId = unitId || lead.interestedUnit;
    if (targetUnitId) {
      const unit = await unitModel.findById(targetUnitId);
      if (!unit) {
        throw new AppError('Target unit not found.', 404);
      }
      if (
        unit.propertyId !== lead.propertyId &&
        unit.property_id !== lead.property_id
      ) {
        throw new AppError(
          "Target unit does not belong to the lead's property.",
          400
        );
      }
    }

    // 4. [DELEGATION] Transformation: Start the complex cross-service workflow to create user, tenant, and draft lease
    const result = await userService.convertLeadToTenant(
      id,
      startDate,
      endDate,
      {
        nic,
        permanentAddress,
        emergencyContactName,
        emergencyContactPhone,
        monthlyIncome,
        unitId,
        documentUrl: req.body.documentUrl,
      },
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
