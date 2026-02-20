
import leadModel from '../models/leadModel.js';
import unitModel from '../models/unitModel.js';
import propertyModel from '../models/propertyModel.js';
import userModel from '../models/userModel.js';
import leadStageHistoryModel from '../models/leadStageHistoryModel.js';
import leadTokenModel from '../models/leadTokenModel.js';
import emailService from '../utils/emailService.js';
import { validateEmail, validatePhoneNumber } from '../utils/validators.js';

class LeadService {

    async registerInterest(data) {
        const { name, email, phone, propertyId, interestedUnit, unitId, notes, moveInDate, occupantsCount } = data;

        if (!name || !email || !propertyId) {
            throw new Error('Name, email, and property are required');
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.isValid) throw new Error(emailValidation.error);

        if (phone) {
            const phoneValidation = validatePhoneNumber(phone);
            if (!phoneValidation.isValid) throw new Error(phoneValidation.error);
        }

        let finalUnitId = unitId || interestedUnit;

        if (finalUnitId && finalUnitId !== '' && finalUnitId !== 'null') {
            const unitCheck = await unitModel.findById(finalUnitId);
            if (!unitCheck) throw new Error('Invalid unit selected');
            
            if (String(unitCheck.propertyId) !== String(propertyId)) {
                throw new Error('Selected unit does not belong to the specified property');
            }
        } else {
            finalUnitId = null;
            const occupiedCount = await unitModel.countOccupied(propertyId);
            if (occupiedCount > 0) {
                 throw new Error('Cannot express interest in the whole property because some units are currently occupied. Please select a specific unit.');
            }
        }

        // Check for existing user — allow if role is 'lead', reject if other role
        let userId = null;
        const existingUser = await userModel.findByEmail(email);
        if (existingUser) {
            if (existingUser.role !== 'lead') {
                throw new Error('This email is already associated with an account. Please log in or contact the property owner.');
            }
            userId = existingUser.user_id;
        }

        const existingLeadId = await leadModel.findIdByEmailAndProperty(email, propertyId);
        
        let leadId;
        let message;
        let isNew = false;

        if (existingLeadId) {
            leadId = existingLeadId;
            await leadModel.update(leadId, {
                lastContactedAt: new Date(),
                notes: notes ? `${notes} (Re-inquiry)` : undefined,
            });
            message = 'Interest updated. We will contact you soon.';
        } else {
            // Create a lightweight user row if one doesn't exist yet
            if (!userId) {
                userId = await userModel.create({
                    name,
                    email,
                    phone,
                    passwordHash: 'NO_LOGIN',  // Cannot be matched by bcrypt — lead cannot log in
                    role: 'lead',
                    is_email_verified: true,
                    status: 'active',
                });
            }

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
                status: 'interested',
                userId: userId,
            });
            message = 'Interest registered! We will contact you soon.';
            isNew = true;
        }

        // Generate portal access token (create new or reuse existing)
        let portalToken = await leadTokenModel.findByLeadId(leadId);
        if (!portalToken) {
            portalToken = await leadTokenModel.create(leadId);
        }

        // Email Notification with portal link
        try {
            const property = await propertyModel.findById(propertyId);
            const propertyName = property ? property.name : 'our property';
            await emailService.sendWelcomeLead(email, name, propertyName, portalToken); 
        } catch (emailErr) {
            console.error('Failed to send confirmation email', emailErr);
        }

        return { id: leadId, message, isNew };
    }

    async getLeads(user) {
        if (user.role !== 'owner') {
             throw new Error('Access denied.');
        }
        return await leadModel.findAll(user.id);
    }

    async getMyLead(email) {
        return await leadModel.findByEmail(email);
    }
    
    async updateLead(id, data, user) {
        if (user.role !== 'owner') {
             throw new Error('Access denied.');
        }
        const success = await leadModel.update(id, data);
        if (!success) throw new Error('Lead not found');
        return success;
    }

    async getLeadStageHistory(user) {
         if (user.role !== 'owner') {
             throw new Error('Access denied.');
         }
         return await leadStageHistoryModel.findAll(user.id);
    }
}

export default new LeadService();
