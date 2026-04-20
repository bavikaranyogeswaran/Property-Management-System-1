// ============================================================================
//  LEAD SERVICE (The CRM Engine)
// ============================================================================
//  This service manages the relationship with prospects.
//  It handles interest registration, lead scoring, follow-ups, and
//  provides portal access for applicants to track their progress.
// ============================================================================

import leadModel from '../models/leadModel.js';
import unitModel from '../models/unitModel.js';
import visitModel from '../models/visitModel.js';
import propertyModel from '../models/propertyModel.js';
import userModel from '../models/userModel.js';
import leadStageHistoryModel from '../models/leadStageHistoryModel.js';
import leadTokenModel from '../models/leadTokenModel.js';
import leadFollowupModel from '../models/leadFollowupModel.js';
import emailService from '../utils/emailService.js';
import { validateEmail, validatePhoneNumber } from '../utils/validators.js';
import {
  getCurrentDateString,
  getLocalTime,
  formatToLocalDate,
  parseLocalDate,
  addMonths,
  isBefore,
  isToday,
} from '../utils/dateUtils.js';
import { isAtLeast, ROLES } from '../utils/roleUtils.js';
import userService from './userService.js';
import leaseService from './leaseService.js';
import leaseModel from '../models/leaseModel.js';

class LeadService {
  // REGISTER INTEREST: The "Landing Page" entry point. Captures public inquiries and initializes CRM tracking.
  async registerInterest(data) {
    const {
      name,
      email,
      phone,
      propertyId,
      interestedUnit,
      unitId,
      notes,
      moveInDate,
      occupantsCount,
      preferredTermMonths,
      leaseTermId,
    } = data;

    // 1. [VALIDATION] Mandatory field and format checks
    if (!name || !email || !propertyId)
      throw new Error('Name, email, and property are required');
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) throw new Error(emailValidation.error);

    // 2. [VALIDATION] Prevent bookings/leads in the past
    if (moveInDate) {
      const startDate = parseLocalDate(moveInDate);
      if (isBefore(startDate, getLocalTime()) && !isToday(startDate))
        throw new Error('Preferred move-in date cannot be in the past');
    }

    // 3. Unit Resolution: Handle specific unit vs property-wide inquiries
    let finalUnitId = unitId || interestedUnit;
    if (finalUnitId && finalUnitId !== '' && finalUnitId !== 'null') {
      const unitCheck = await unitModel.findById(finalUnitId);
      if (!unitCheck) throw new Error('Invalid unit selected');
      if (String(unitCheck.propertyId) !== String(propertyId))
        throw new Error('Unit mismatch for property.');
    } else {
      finalUnitId = null;
      if ((await unitModel.countOccupied(propertyId)) > 0)
        throw new Error(
          'Cannot inquire property-wide while units are occupied.'
        );
    }

    // 4. [SECURITY] Role Guard: prevent staff from registering as leads
    const existingUser = await userModel.findByEmail(email);
    if (existingUser && existingUser.role !== ROLES.TENANT)
      throw new Error('Email associated with staff account.');

    // 5. Overlap Logic: Soft-check for physical availability for requested period
    if (finalUnitId && moveInDate && preferredTermMonths) {
      const startDate = parseLocalDate(moveInDate);
      const endDate = addMonths(startDate, parseInt(preferredTermMonths, 10));
      const hasOverlap = await (
        await import('../models/leaseModel.js')
      ).default.checkOverlap(
        finalUnitId,
        formatToLocalDate(startDate),
        formatToLocalDate(endDate)
      );
      if (hasOverlap) throw new Error('Unit unavailable for requested period.');
    }

    // 6. Lead Scoring: Rank prospect based on quality metrics
    const score = this.calculateLeadScore({
      preferredTermMonths,
      moveInDate,
      phone,
    });

    // 7. Upsert Logic: Identify re-inquiries or create new Lead entry
    const existingLeadId = await leadModel.findIdByEmailAndProperty(
      email,
      propertyId
    );
    let leadId;
    let isNew = false;

    if (existingLeadId) {
      leadId = existingLeadId;
      // [AUDIT] Log if prospect changed their unit of interest
      if (finalUnitId) {
        const existingLead = await leadModel.findById(leadId);
        if (
          existingLead?.interestedUnit &&
          String(existingLead.interestedUnit) !== String(finalUnitId)
        ) {
          await leadStageHistoryModel.create(
            leadId,
            existingLead.status,
            existingLead.status,
            `Unit interest changed from #${existingLead.interestedUnit} to #${finalUnitId}`
          );
        }
      }
      await leadModel.update(leadId, {
        lastContactedAt: getLocalTime(),
        notes: notes ? `${notes} (Re-inquiry)` : undefined,
        interestedUnit: finalUnitId,
        name,
        phone,
        move_in_date: moveInDate,
        occupants_count: occupantsCount,
        preferred_term_months: preferredTermMonths,
        lease_term_id: leaseTermId,
        score,
      });
    } else {
      leadId = await leadModel.create({
        propertyId,
        unitId: finalUnitId,
        interestedUnit: finalUnitId,
        name,
        phone,
        email,
        notes,
        move_in_date: moveInDate,
        occupants_count: occupantsCount,
        preferred_term_months: preferredTermMonths,
        lease_term_id: leaseTermId,
        status: 'interested',
        score,
      });
      isNew = true;
    }

    // 8. [SIDE EFFECT] Portal Access: Rotate token and send welcome email
    await leadTokenModel.invalidateForLead(leadId);
    const portalToken = await leadTokenModel.create(leadId);
    try {
      const property = await propertyModel.findById(propertyId);
      await emailService.sendWelcomeLead(
        email,
        name,
        property?.name || 'our property',
        portalToken
      );
    } catch (e) {
      console.error('Lead welcome email failed:', e);
    }

    return {
      id: leadId,
      message: isNew ? 'Interest registered!' : 'Interest updated.',
      isNew,
    };
  }

  // FETCH LEADS: Retrieves prospects filtered by staff assignment.
  async getLeads(user) {
    if (user.role === ROLES.SYSTEM) return await leadModel.findAll(null);
    if (user.role === ROLES.OWNER) return await leadModel.findAll(user.id);
    if (user.role === ROLES.TREASURER)
      return await leadModel.findByTreasurerId(user.id);
    throw new Error('Access denied.');
  }

  async getMyLead(email) {
    return await leadModel.findByEmail(email);
  }

  // UPDATE LEAD: Staff management of the prospect pipeline status.
  async updateLead(id, data, user) {
    // 1. [SECURITY] RBAC and Ownership Check
    if (!isAtLeast(user.role, ROLES.OWNER)) throw new Error('Access denied.');
    const isOwner = await leadModel.verifyOwnership(id, user.id);
    if (!isOwner) throw new Error('Lead mismatch for property owner.');

    if (data.status) {
      const currentLead = await leadModel.findById(id);
      if (!currentLead) throw new Error('Lead not found');

      // 2. [SECURITY] Terminal State Guard: once 'converted' or 'dropped', status is locked.
      if (
        ['converted', 'dropped'].includes(currentLead.status) &&
        data.status !== currentLead.status
      ) {
        throw new Error(`Cannot modify terminal status: ${currentLead.status}`);
      }

      // 3. [SECURITY] Entry Point Guard: conversion must happen through Formal Conversion tool
      if (data.status === 'converted' && currentLead.status !== 'converted')
        throw new Error('Conversion required.');

      if (
        !['interested', 'viewed', 'converted', 'dropped'].includes(data.status)
      )
        throw new Error('Invalid status.');
    }

    // 4. Commit updates
    const success = await leadModel.update(id, data);

    // 5. [SIDE EFFECT] Cleanup: Cancel visits and revoke portal tokens for dropped leads
    if (data.status === 'dropped') {
      await visitModel.cancelVisitsForLead(id);
      await leadTokenModel.invalidateForLead(id);
    }

    return success;
  }

  async getLeadStageHistory(user) {
    if (!isAtLeast(user.role, ROLES.OWNER)) {
      throw new Error('Access denied.');
    }
    return await leadStageHistoryModel.findAll(user.id);
  }

  // RESEND PORTAL LINK: CRM tool to provide access links to prospects.
  async resendPortalLink(leadId, user) {
    // 1. [SECURITY] Role check
    if (!isAtLeast(user.role, ROLES.TREASURER))
      throw new Error('Access denied.');

    // 2. Fetch lead and identify state
    const lead = await leadModel.findById(leadId);
    if (!lead) throw new Error('Lead not found');

    // 3. [SIDE EFFECT] Special case: Converted Leads (re-deliver appropriate credentials/links)
    if (lead.status === 'converted') {
      const existingUser = await userModel.findByEmail(lead.email);
      if (existingUser) {
        // If they have an unpaid draft lease, resend the deposit payment link
        const draftLease = (
          await leaseModel.findByTenantId(existingUser.id)
        ).find((l) => l.status === 'draft');
        if (draftLease) {
          const depStatus = await leaseModel.getDepositStatus(draftLease.id);
          if (depStatus && !depStatus.isFullyPaid) {
            await leaseService.regenerateMagicLink(draftLease.id, user);
            return { success: true, message: 'Deposit payment link resent.' };
          }
        }
        // Otherwise, resend the general account setup link
        return await userService.resendInvitation(existingUser.id);
      }
    }

    // 4. Guest Phase: rotate portal token and resend Welcome email
    await leadTokenModel.invalidateForLead(leadId);
    const portalToken = await leadTokenModel.create(leadId);
    try {
      const property = await propertyModel.findById(lead.propertyId);
      await emailService.sendWelcomeLead(
        lead.email,
        lead.name,
        property?.name || 'our property',
        portalToken
      );
    } catch (e) {
      console.error('Token resend email failed:', e);
    }

    return { success: true };
  }

  // CALCULATE LEAD SCORE: Quality ranking based on urgency and seriousness.
  calculateLeadScore(data) {
    const { preferredTermMonths, moveInDate, phone } = data;
    let score = 0;

    // Favor long-term leases
    if (preferredTermMonths) score += parseInt(preferredTermMonths, 10) * 5;

    // Contactability bonus
    if (phone) score += 10;

    // Urgency bonus: higher score for leads looking to move in within 30 days
    if (moveInDate) {
      const diffDays = Math.ceil(
        Math.abs(parseLocalDate(moveInDate) - getLocalTime()) /
          (1000 * 60 * 60 * 24)
      );
      if (diffDays <= 30) score += 20;
      else if (diffDays <= 60) score += 10;
    }

    return score;
  }

  // --- Follow-up Management ---
  async getFollowups(leadId, user) {
    if (!isAtLeast(user.role, ROLES.TREASURER))
      throw new Error('Access denied.');
    if (!(await leadModel.verifyOwnership(leadId, user.id)))
      throw new Error('Access denied to lead.');
    return await leadFollowupModel.findByLeadId(leadId);
  }

  async createFollowup(leadId, data, user) {
    if (!isAtLeast(user.role, ROLES.TREASURER))
      throw new Error('Access denied.');
    if (!(await leadModel.verifyOwnership(leadId, user.id)))
      throw new Error('Access denied to lead.');

    return await leadFollowupModel.create({
      leadId,
      followupDate: data.followupDate,
      notes: data.notes,
    });
  }

  async getUpcomingFollowups(user) {
    // Restricted to Owners for primary CRM dashboard
    if (!isAtLeast(user.role, ROLES.OWNER)) return [];
    return await leadFollowupModel.findUpcoming(user.id);
  }
}

export default new LeadService();
