import leadModel from '../models/leadModel.js';
import leadTokenModel from '../models/leadTokenModel.js';
import messageModel from '../models/messageModel.js';
import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';
import leaseTermModel from '../models/leaseTermModel.js';
import db from '../config/db.js';
import AppError from '../utils/AppError.js';

class LeadPortalService {
  /**
   * Retrieves comprehensive portal data for a given token.
   * Orchestrates multi-model loads and enforces PII protection.
   */
  async getPortalContext(token) {
    if (!token) {
      throw new AppError('Access token is required', 400);
    }

    const tokenRecord = await leadTokenModel.findByToken(token);
    if (!tokenRecord) {
      throw new AppError(
        'Invalid or expired access link. Please contact the property owner for a new link.',
        401
      );
    }

    const lead = await leadModel.findById(tokenRecord.leadId);
    if (!lead) {
      throw new AppError('Lead not found', 404);
    }

    // [SECURITY] Block access for 'dropped' inquiries
    if (lead.status === 'dropped') {
      throw new AppError(
        'This inquiry has been closed. Please contact the property owner for more information.',
        403
      );
    }

    // Fetch property and unit details
    const [property, unit] = await Promise.all([
      lead.propertyId
        ? propertyModel.findById(lead.propertyId)
        : Promise.resolve(null),
      lead.interestedUnit
        ? unitModel.findById(lead.interestedUnit)
        : Promise.resolve(null),
    ]);

    // Fetch associated draft lease if it exists
    let activeLease = null;
    if (lead.email) {
      const leaseModel = (await import('../models/leaseModel.js')).default;
      const [leases] = await db.query(
        "SELECT * FROM leases WHERE tenant_id = (SELECT user_id FROM users WHERE email = ? LIMIT 1) AND status = 'draft' ORDER BY created_at DESC LIMIT 1",
        [lead.email]
      );

      if (leases.length > 0) {
        const rawLease = leaseModel.mapRows(leases)[0];
        const depositStats = await leaseModel.getDepositStatus(rawLease.id);

        // [SECURITY] PII Sanitization
        activeLease = {
          id: rawLease.id,
          startDate: rawLease.startDate,
          endDate: rawLease.endDate,
          monthlyRent: rawLease.monthlyRent,
          status: rawLease.status,
          currentDepositBalance: rawLease.currentDepositBalance,
          depositStatus: rawLease.depositStatus,
          targetDeposit: rawLease.targetDeposit,
          documentUrl: rawLease.documentUrl,
          depositStats: depositStats,
        };
      }
    }

    // Fetch lease terms for the owner
    let leaseTerms = [];
    if (property && property.owner_id) {
      leaseTerms = await leaseTermModel.findAllByOwner(property.owner_id);
    }

    // Construct Portal DTO (Sanitized)
    return {
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        propertyId: lead.propertyId,
        interestedUnit: lead.interestedUnit,
        createdAt: lead.createdAt,
        moveInDate: lead.moveInDate,
        preferredTermMonths: lead.preferredTermMonths,
      },
      property: property
        ? {
            name: property.name,
            street: property.street,
            city: property.city,
            district: property.district,
          }
        : null,
      unit: unit
        ? {
            unitNumber: unit.unitNumber,
            type: unit.type,
            monthlyRent: unit.monthlyRent,
            status: unit.status,
            isAvailable: unit.status === 'available',
          }
        : null,
      activeLease,
      leaseTerms,
    };
  }

  async getMessages(token) {
    if (!token) throw new AppError('Access token is required', 400);

    const tokenRecord = await leadTokenModel.findByToken(token);
    if (!tokenRecord) throw new AppError('Invalid or expired access link', 401);

    return await messageModel.findByLeadId(tokenRecord.leadId);
  }

  async sendMessage(token, content) {
    if (!token) throw new AppError('Access token is required', 400);
    if (!content || !content.trim())
      throw new AppError('Message content is required', 400);

    const tokenRecord = await leadTokenModel.findByToken(token);
    if (!tokenRecord) throw new AppError('Invalid or expired access link', 401);

    const lead = await leadModel.findById(tokenRecord.leadId);
    if (!lead) throw new AppError('Lead not found', 404);

    if (lead.status === 'dropped') {
      throw new AppError(
        'This inquiry has been closed. You cannot send messages.',
        403
      );
    }

    const messageId = await messageModel.create({
      leadId: tokenRecord.leadId,
      senderId: null,
      content: content.trim(),
      senderType: 'lead',
      senderLeadId: lead.id,
    });

    await leadModel.update(tokenRecord.leadId, {
      lastContactedAt: new Date(),
    });

    return {
      id: messageId,
      leadId: tokenRecord.leadId,
      senderLeadId: lead.id,
      senderType: 'lead',
      content: content.trim(),
      createdAt: new Date(),
      isRead: false,
      senderName: lead.name,
      senderRole: 'lead',
    };
  }

  async updatePreferences(token, preferences) {
    if (!token) throw new AppError('Access token is required', 400);

    const tokenRecord = await leadTokenModel.findByToken(token);
    if (!tokenRecord) throw new AppError('Invalid or expired access link', 401);

    const { moveInDate, preferredTermMonths, leaseTermId } = preferences;

    await leadModel.update(tokenRecord.leadId, {
      move_in_date: moveInDate,
      preferred_term_months: preferredTermMonths,
      lease_term_id: leaseTermId || null,
    });

    return { success: true };
  }
}

export default new LeadPortalService();
