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

class LeadService {
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

    if (!name || !email || !propertyId) {
      throw new Error('Name, email, and property are required');
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) throw new Error(emailValidation.error);

    if (phone) {
      const phoneValidation = validatePhoneNumber(phone);
      if (!phoneValidation.isValid) throw new Error(phoneValidation.error);
    }

    // [E-Past Validation] Prevent move-in dates in the past
    if (moveInDate) {
      const startDate = parseLocalDate(moveInDate);
      if (isBefore(startDate, getLocalTime()) && !isToday(startDate)) {
        throw new Error('Preferred move-in date cannot be in the past');
      }
    }

    let finalUnitId = unitId || interestedUnit;

    if (finalUnitId && finalUnitId !== '' && finalUnitId !== 'null') {
      const unitCheck = await unitModel.findById(finalUnitId);
      if (!unitCheck) throw new Error('Invalid unit selected');

      if (String(unitCheck.propertyId) !== String(propertyId)) {
        throw new Error(
          'Selected unit does not belong to the specified property'
        );
      }
    } else {
      finalUnitId = null;
      const occupiedCount = await unitModel.countOccupied(propertyId);
      if (occupiedCount > 0) {
        throw new Error(
          'Cannot express interest in the whole property because some units are currently occupied. Please select a specific unit.'
        );
      }
    }

    // Check if email belongs to a staff/owner — reject if so
    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      const allowedRoles = [ROLES.TENANT];
      if (!allowedRoles.includes(existingUser.role)) {
        throw new Error(
          'This email is already associated with a staff/owner account. Please use a different email or log in.'
        );
      }
    }

    // --- OVERLAP & PREFERENCE Logic ---
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

      if (hasOverlap) {
        throw new Error(
          'This unit is already booked/occupied for part of your requested period. Please try a different start date or unit.'
        );
      }
    }

    const score = this.calculateLeadScore({
      preferredTermMonths,
      moveInDate,
      phone,
    });

    const existingLeadId = await leadModel.findIdByEmailAndProperty(
      email,
      propertyId
    );

    let leadId;
    let message;
    let isNew = false;

    if (existingLeadId) {
      leadId = existingLeadId;

      // [C1 FIX] Log unit interest change before overwriting
      if (finalUnitId) {
        const existingLead = await leadModel.findById(leadId);
        if (
          existingLead &&
          existingLead.interestedUnit &&
          String(existingLead.interestedUnit) !== String(finalUnitId)
        ) {
          await leadStageHistoryModel.create(
            leadId,
            existingLead.status,
            existingLead.status, // status stays the same
            `Unit interest changed from Unit #${existingLead.interestedUnit} to Unit #${finalUnitId}`
          );
        }
      }

      await leadModel.update(leadId, {
        lastContactedAt: getLocalTime(),
        notes: notes ? `${notes} (Re-inquiry)` : undefined,
        interestedUnit: finalUnitId,
        unitId: finalUnitId,
        name: name,
        phone: phone,
        move_in_date: moveInDate,
        occupants_count: occupantsCount,
        preferred_term_months: preferredTermMonths,
        lease_term_id: leaseTermId,
        score: score,
      });
      message = 'Interest updated. We will contact you soon.';
    } else {
      // No user row is created — leads are guests, not system users
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
        score: score,
      });
      message = 'Interest registered! We will contact you soon.';
      isNew = true;
    }

    // Generate portal access token (ALWAYS rotate on re-inquiry)
    await leadTokenModel.invalidateForLead(leadId);
    const portalToken = await leadTokenModel.create(leadId);

    // Email Notification with portal link
    try {
      const property = await propertyModel.findById(propertyId);
      const propertyName = property ? property.name : 'our property';
      await emailService.sendWelcomeLead(
        email,
        name,
        propertyName,
        portalToken
      );
    } catch (emailErr) {
      console.error('Failed to send confirmation email', emailErr);
    }

    return { id: leadId, message, isNew };
  }

  async getLeads(user) {
    if (user.role === ROLES.SYSTEM) {
      return await leadModel.findAll(null);
    }
    if (user.role === ROLES.OWNER) {
      return await leadModel.findAll(user.id);
    } else if (user.role === ROLES.TREASURER) {
      return await leadModel.findByTreasurerId(user.id);
    }
    throw new Error('Access denied.');
  }

  async getMyLead(email) {
    return await leadModel.findByEmail(email);
  }

  async updateLead(id, data, user) {
    if (!isAtLeast(user.role, ROLES.OWNER)) {
      throw new Error('Access denied.');
    }

    const isOwner = await leadModel.verifyOwnership(id, user.id);
    if (!isOwner)
      throw new Error(
        'Access denied. This lead does not belong to your property.'
      );

    // Status validation
    if (data.status) {
      const currentLead = await leadModel.findById(id);
      if (!currentLead) throw new Error('Lead not found');

      // 1. Prevent moving away from terminal states
      if (
        currentLead.status === 'converted' ||
        currentLead.status === 'dropped'
      ) {
        if (data.status !== currentLead.status) {
          throw new Error(
            `Cannot change status of a ${currentLead.status} lead.`
          );
        }
      }

      // 2. Prevent setting to 'converted' directly
      if (data.status === 'converted' && currentLead.status !== 'converted') {
        throw new Error(
          "Leads must be converted via the 'Convert to Tenant' process."
        );
      }

      // 3. Validate enum
      const validStatuses = ['interested', 'viewed', 'converted', 'dropped'];
      if (!validStatuses.includes(data.status)) {
        throw new Error('Invalid status value.');
      }
    }

    const success = await leadModel.update(id, data);
    if (!success) throw new Error('Lead update failed');

    // Cancel pending visits and revoke tokens when lead is dropped
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

  async resendPortalLink(leadId, user) {
    if (!isAtLeast(user.role, ROLES.TREASURER)) {
      throw new Error('Access denied.');
    }

    const lead = await leadModel.findById(leadId);
    if (!lead) throw new Error('Lead not found');

    // Verification of ownership
    const isOwner = await leadModel.verifyOwnership(leadId, user.id);
    // If treasurer, verify via property assignment (LeadModel.findByTreasurerId already does this)
    // But here we need a check.
    // For simplicity, LeadModel.verifyOwnership can be updated to include treasurer check or we do it here.

    // [NEW] Handle converted leads by resending tenant-level access
    if (lead.status === 'converted') {
      const userService = (await import('./userService.js')).default;
      const existingUser = await (
        await import('../models/userModel.js')
      ).default.findByEmail(lead.email);

      if (existingUser) {
        // 1. If there's an active draft lease with an unpaid deposit, resend the deposit link
        const leaseModel = (await import('../models/leaseModel.js')).default;
        const tenantLeases = await leaseModel.findByTenantId(existingUser.id);
        const draftLease = tenantLeases.find((l) => l.status === 'draft');

        if (draftLease) {
          const depositStatus = await leaseModel.getDepositStatus(
            draftLease.id
          );
          if (depositStatus && !depositStatus.isFullyPaid) {
            // Check for existing valid deposit token
            const [tokens] = await (
              await import('../config/db.js')
            ).default.query(
              "SELECT token FROM security_tokens WHERE entity_id = ? AND type = 'deposit_access' AND expires_at > NOW() AND is_revoked = FALSE ORDER BY created_at DESC LIMIT 1",
              [draftLease.id]
            );

            if (tokens.length > 0) {
              const property = await propertyModel.findById(lead.propertyId);
              await emailService.sendDepositMagicLink(
                lead.email,
                lead.name,
                property?.name || 'Property',
                draftLease.unitNumber || 'N/A',
                draftLease.targetDeposit,
                tokens[0].token
              );
              return {
                success: true,
                message: 'Deposit payment link resent successfully.',
              };
            }
          }
        }

        // 2. Otherwise, resend the account invitation (setup link)
        return await userService.resendInvitation(existingUser.id);
      }
    }

    // Rotate token
    await leadTokenModel.invalidateForLead(leadId);
    const portalToken = await leadTokenModel.create(leadId);

    const property = await propertyModel.findById(lead.propertyId);
    const propertyName = property ? property.name : 'our property';

    await emailService.sendWelcomeLead(
      lead.email,
      lead.name,
      propertyName,
      portalToken
    );

    return { success: true };
  }

  calculateLeadScore(data) {
    const { preferredTermMonths, moveInDate, phone } = data;
    let score = 0;

    // Term score (long term is better)
    if (preferredTermMonths) {
      score += parseInt(preferredTermMonths, 10) * 5;
    }

    // Phone provided (serious lead)
    if (phone) {
      score += 10;
    }

    // Urgency score (moving in soon is better)
    if (moveInDate) {
      const moveIn = parseLocalDate(moveInDate);
      const today = getLocalTime();
      const diffTime = Math.abs(moveIn - today);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 30) {
        score += 20;
      } else if (diffDays <= 60) {
        score += 10;
      }
    }

    return score;
  }

  // --- Follow-up Management ---
  async getFollowups(leadId, user) {
    if (!isAtLeast(user.role, ROLES.TREASURER)) {
      throw new Error('Access denied.');
    }
    const isOwnerOrAuth = await leadModel.verifyOwnership(leadId, user.id);
    if (!isOwnerOrAuth) throw new Error('Access denied to this lead.');

    return await leadFollowupModel.findByLeadId(leadId);
  }

  async createFollowup(leadId, data, user) {
    if (!isAtLeast(user.role, ROLES.TREASURER)) {
      throw new Error('Access denied.');
    }
    const isOwnerOrAuth = await leadModel.verifyOwnership(leadId, user.id);
    if (!isOwnerOrAuth) throw new Error('Access denied to this lead.');

    return await leadFollowupModel.create({
      leadId,
      followupDate: data.followupDate,
      notes: data.notes,
    });
  }

  async getUpcomingFollowups(user) {
    if (!isAtLeast(user.role, ROLES.OWNER)) return []; // For now owner only for dashboard
    return await leadFollowupModel.findUpcoming(user.id);
  }
}

export default new LeadService();
