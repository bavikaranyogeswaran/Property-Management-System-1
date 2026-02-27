
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

        // Check if email belongs to a staff/owner — reject if so
        const existingUser = await userModel.findByEmail(email);
        if (existingUser) {
            const allowedRoles = ['tenant'];
            if (!allowedRoles.includes(existingUser.role)) {
                throw new Error('This email is already associated with a staff/owner account. Please use a different email or log in.');
            }
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
                interestedUnit: finalUnitId,
                unitId: finalUnitId,
                name: name,
                phone: phone,
                move_in_date: moveInDate,
                occupants_count: occupantsCount
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
                status: 'interested',
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
        const isOwner = await leadModel.verifyOwnership(id, user.id);
        if (!isOwner) throw new Error('Access denied. This lead does not belong to your property.');
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
