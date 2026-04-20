import leadModel from '../models/leadModel.js';
import leadTokenModel from '../models/leadTokenModel.js';
import messageModel from '../models/messageModel.js';
import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';
import leaseTermModel from '../models/leaseTermModel.js';
import db from '../config/db.js';
import AppError from '../utils/AppError.js';
import leaseModel from '../models/leaseModel.js';

class LeadPortalService {
  /**
   * Retrieves comprehensive portal data for a given token.
   * Orchestrates multi-model loads and enforces PII protection.
   */
  // GET PORTAL CONTEXT: Detailed hydration engine for the public-facing Lead Portal (No login required).
  // Orchestrates multi-model loads while enforcing strict PII protection and status-based access.
  async getPortalContext(token) {
    if (!token) throw new AppError('Token required', 400);

    // 1. [SECURITY] Token Validation: Verify the opaque access link exists and is not expired
    const tokenRecord = await leadTokenModel.findByToken(token);
    if (!tokenRecord)
      throw new AppError('Invalid or expired access link.', 401);

    // 2. [SECURITY] Lead Identity Resolving: Fetch the associated inquiry record
    const lead = await leadModel.findById(tokenRecord.leadId);
    if (!lead) throw new AppError('Lead not found', 404);

    // 3. [SECURITY] Status Guard: Block access if the lead has been 'dropped' (Closed inquiry)
    if (lead.status === 'dropped')
      throw new AppError('This inquiry is closed.', 403);

    // 4. Resolve Structural Context: Fetch building and unit details (Sanitized for public browse)
    const [property, unit] = await Promise.all([
      lead.propertyId
        ? propertyModel.findById(lead.propertyId)
        : Promise.resolve(null),
      lead.interestedUnit
        ? unitModel.findById(lead.interestedUnit)
        : Promise.resolve(null),
    ]);

    // 5. [SECURITY] Lease Discovery: Safely check for an associated 'draft' lease for this email
    let activeLease = null;
    if (lead.email) {
      const [leases] = await db.query(
        "SELECT * FROM leases WHERE tenant_id = (SELECT user_id FROM users WHERE email = ? LIMIT 1) AND status = 'draft' ORDER BY created_at DESC LIMIT 1",
        [lead.email]
      );
      if (leases.length > 0) {
        const rawLease = leaseModel.mapRows(leases)[0];
        const depositStats = await leaseModel.getDepositStatus(rawLease.id);
        // [PII] Sanitize lease DTO for the lead's view (Hide other tenants/private notes)
        activeLease = {
          id: rawLease.id,
          startDate: rawLease.startDate,
          endDate: rawLease.endDate,
          monthlyRent: rawLease.monthlyRent,
          status: rawLease.status,
          depositStats,
        };
      }
    }

    // 6. Construct Final Sanitized Context DTO
    return {
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        status: lead.status,
        interestedUnit: lead.interestedUnit,
        moveInDate: lead.moveInDate,
      },
      property: property ? { name: property.name, city: property.city } : null,
      unit: unit
        ? {
            unitNumber: unit.unitNumber,
            type: unit.type,
            monthlyRent: unit.monthlyRent,
            status: unit.status,
          }
        : null,
      activeLease,
      leaseTerms: property?.owner_id
        ? await leaseTermModel.findAllByOwner(property.owner_id)
        : [],
    };
  }

  // GET MESSAGES: Retrieves the communication thread between the lead and the property staff.
  async getMessages(token) {
    if (!token) throw new AppError('Token required', 400);

    // 1. [SECURITY] Authenticate via token
    const tokenRecord = await leadTokenModel.findByToken(token);
    if (!tokenRecord) throw new AppError('Unauthorized', 401);

    return await messageModel.findByLeadId(tokenRecord.leadId);
  }

  // SEND MESSAGE: Dispatches an inquiry update or question from the lead to the owner dashboard.
  async sendMessage(token, content) {
    if (!token) throw new AppError('Token required', 400);
    if (!content?.trim()) throw new AppError('Content required', 400);

    // 1. [SECURITY] Resolve identity via token
    const tokenRecord = await leadTokenModel.findByToken(token);
    if (!tokenRecord) throw new AppError('Unauthorized', 401);
    const lead = await leadModel.findById(tokenRecord.leadId);
    if (!lead || lead.status === 'dropped')
      throw new AppError('Inquiry closed', 403);

    // 2. Persist message record (SenderType 'lead' signals it's from the portal)
    const messageId = await messageModel.create({
      leadId: tokenRecord.leadId,
      content: content.trim(),
      senderType: 'lead',
      senderLeadId: lead.id,
    });

    // 3. [SIDE EFFECT] Engagement Tracking: Update last contacted timestamp to bump proximity score
    await leadModel.update(tokenRecord.leadId, { lastContactedAt: new Date() });

    return {
      id: messageId,
      content: content.trim(),
      createdAt: new Date(),
      senderName: lead.name,
    };
  }

  // UPDATE PREFERENCES: Updates the lead's moving constraints (Move-in date/Term).
  async updatePreferences(token, preferences) {
    if (!token) throw new AppError('Token required', 400);

    // 1. [SECURITY] Authenticate
    const tokenRecord = await leadTokenModel.findByToken(token);
    if (!tokenRecord) throw new AppError('Unauthorized', 401);

    const { moveInDate, preferredTermMonths, leaseTermId } = preferences;

    // 2. Persist updated constraints
    await leadModel.update(tokenRecord.leadId, {
      move_in_date: moveInDate,
      preferred_term_months: preferredTermMonths,
      lease_term_id: leaseTermId || null,
    });

    return { success: true };
  }
}

export default new LeadPortalService();
