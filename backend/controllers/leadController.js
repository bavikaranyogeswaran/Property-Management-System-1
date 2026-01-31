import userService from '../services/userService.js';
import leadModel from '../models/leadModel.js';
import leadStageHistoryModel from '../models/leadStageHistoryModel.js';
import db from '../config/db.js';
import { validatePassword, validateEmail, validatePhoneNumber } from '../utils/validators.js';

class LeadController {
    async convertLead(req, res) {
        try {
            // Check if user is owner (RBAC)
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied. Only Owners can convert leads.' });
            }

            const { id } = req.params;
            const { startDate, endDate, nic, permanentAddress, employerName, monthlyIncome } = req.body;

            const tenantData = { nic, permanentAddress, employerName, monthlyIncome };

            const result = await userService.convertLeadToTenant(id, startDate, endDate, tenantData);
            res.status(200).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async getLeads(req, res) {
        try {
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied.' });
            }
            console.log(`[DEBUG] getLeads called by UserID: ${req.user.id}, Role: ${req.user.role}`);
            // Filter leads by this owner's properties
            const leads = await leadModel.findAll(req.user.id);
            console.log(`[DEBUG] getLeads found ${leads.length} leads.`);
            res.json(leads);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getMyLead(req, res) {
        try {
            const email = req.user.email;
            // find lead by email. leadModel.findAll returns all, we might need a specific query or filter.
            // For efficiency, let's just use a direct query in model or filter here if list is small.
            // Better to add findByEmail in model. But for now, let's assume we can filter findAll or add findByEmail.
            // Actually, leadModel.findAll returns everything.
            // Let's add findByEmail to leadModel? Or just query 'SELECT * FROM leads WHERE email = ?'

            // I will add a simple query here or use existing model methods if adaptable.
            // Looking at leadModel, it has findById and findAll.
            // I should add findByEmail to leadModel for better practice, but I can't edit multiple files in one turn easily if I stick to one tool call.
            // I'll filter findAll for now as a quick solution, or just add the query here.

            const leads = await leadModel.findAll();

            console.log(`[DEBUG] getMyLead: User Email: '${email}'`);

            // Find the most recent active lead for this email (case-insensitive & trimmed)
            const myLead = leads.find(l => {
                const leadEmail = l.email ? l.email.trim().toLowerCase() : '';
                const userEmail = email ? email.trim().toLowerCase() : '';

                // Debug matching logic for first few items or if match found
                if (leadEmail === userEmail) console.log(`[DEBUG] Match found with lead ${l.id}`);

                return leadEmail === userEmail && l.status !== 'dropped';
            });

            if (!myLead) {
                console.log(`[DEBUG] No matching lead found for email: '${email}' among ${leads.length} leads.`);
                // Log all lead emails to see what's in DB
                console.log('Available Lead Emails:', leads.map(l => l.email));
                return res.status(404).json({
                    error: `Lead profile not found. UserEmail: '${email}' (len: ${email?.length}). Leads: ${leads.length}. First: ${leads[0]?.email} (${leads[0]?.status})`
                });
            }
            res.json(myLead);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }


    async createLead(req, res) {
        try {
            // Public endpoint - no role check needed

            const { name, email, phone, propertyId, interestedUnit, unitId, notes } = req.body;
            // Password is NO LONGER required for "I'm Interested"

            if (!name || !email || !propertyId) {
                return res.status(400).json({ error: 'Name, email, and property are required' });
            }

            // Email validation
            const emailValidation = validateEmail(email);
            if (!emailValidation.isValid) {
                return res.status(400).json({ error: emailValidation.error });
            }

            // Phone number validation (optional but good)
            if (phone) {
                const phoneValidation = validatePhoneNumber(phone);
                if (!phoneValidation.isValid) {
                    return res.status(400).json({ error: phoneValidation.error });
                }
            }

            // STRICT VALIDATION: Check if unit belongs to property
            let finalUnitId = unitId || interestedUnit;

            if (finalUnitId && finalUnitId !== '' && finalUnitId !== 'null') {
                const [unitCheck] = await db.query(
                    'SELECT property_id FROM units WHERE unit_id = ?',
                    [finalUnitId]
                );

                if (unitCheck.length === 0) {
                    // Invalid unit is not fatal, just ignore it? Or error?
                    // Let's error to be safe.
                    return res.status(400).json({ error: 'Invalid unit selected' });
                }

                if (String(unitCheck[0].property_id) !== String(propertyId)) {
                    return res.status(400).json({ error: 'Selected unit does not belong to the specified property' });
                }
            } else {
                finalUnitId = null;

                // NEW CHECK: If "Whole Property" interest (no specific unit), check if any units are OCCUPIED.
                const [occupiedCheck] = await db.query(
                    "SELECT COUNT(*) as count FROM units WHERE property_id = ? AND status IN ('occupied', 'maintenance')",
                    [propertyId]
                );

                if (occupiedCheck[0].count > 0) {
                    return res.status(400).json({
                        error: 'Cannot express interest in the whole property because some units are currently occupied. Please select a specific unit.'
                    });
                }
            }

            // CHECK ARBITRATION: 
            // Instead of creating a USER account, we check if a LEAD exists.

            // 1. Check if ANY lead exists with this email (across any property? or just this one?)
            // Usually, a "Lead" is per-property interest in some systems, or a "Person" in others.
            // In this DB schema, `leads` table has `property_id`. So one person can be a lead for multiple properties.
            // However, we don't want to create duplicates if they inquire about the SAME property twice.

            const [existingLeads] = await db.query(
                `SELECT lead_id FROM leads WHERE email = ? AND property_id = ? LIMIT 1`,
                [email, propertyId]
            );

            let leadId;
            if (existingLeads.length > 0) {
                // Lead exists for this property -> Update it (e.g. new notes, timestamp)
                leadId = existingLeads[0].lead_id;
                await leadModel.update(leadId, {
                    lastContactedAt: new Date(),
                    notes: notes ? `${notes} (Re-inquiry)` : undefined,
                    // potentially update unit if they changed mind?
                });
                return res.status(200).json({ id: leadId, message: 'Interest updated. We will contact you soon.' });
            } else {
                // Create NEW Lead (No User Account yet)
                leadId = await leadModel.create({
                    propertyId,
                    unitId: finalUnitId,
                    interestedUnit: finalUnitId,
                    name,
                    phone,
                    email,
                    notes,
                    status: 'interested',
                    userId: null // No user account
                });
                return res.status(201).json({ id: leadId, message: 'Interest registered! We will contact you soon.' });
            }

        } catch (error) {
            console.error("Error creating lead:", error);
            res.status(500).json({ error: error.message });
        }
    }

    async updateLead(req, res) {
        try {
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied.' });
            }
            const { id } = req.params;
            const success = await leadModel.update(id, req.body);
            if (!success) {
                return res.status(404).json({ error: 'Lead not found' });
            }
            res.json({ message: 'Lead updated successfully' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async getLeadStageHistory(req, res) {
        try {
            if (req.user.role !== 'owner') {
                return res.status(403).json({ error: 'Access denied.' });
            }
            // Filter history by owner's leads
            const history = await leadStageHistoryModel.findAll(req.user.id);
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

export default new LeadController();
