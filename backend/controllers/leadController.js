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
            const { startDate, endDate } = req.body;

            const result = await userService.convertLeadToTenant(id, startDate, endDate);
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
            // Filter leads by this owner's properties
            const leads = await leadModel.findAll(req.user.id);
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

            const { name, email, phone, propertyId, interestedUnit, unitId, password } = req.body;
            if (!name || !email || !phone || !propertyId || !password) {
                return res.status(400).json({ error: 'Name, email, phone, password and property are required' });
            }

            // Email validation
            const emailValidation = validateEmail(email);
            if (!emailValidation.isValid) {
                return res.status(400).json({ error: emailValidation.error });
            }

            // Phone number validation
            const phoneValidation = validatePhoneNumber(phone);
            if (!phoneValidation.isValid) {
                return res.status(400).json({ error: phoneValidation.error });
            }

            // Password strength validation
            const passwordValidation = validatePassword(password);
            if (!passwordValidation.isValid) {
                return res.status(400).json({
                    error: 'Password does not meet security requirements',
                    details: passwordValidation.errors
                });
            }

            // STRICT VALIDATION: Check if unit belongs to property
            let finalUnitId = unitId || interestedUnit;
            console.log("Creating lead for property:", propertyId, "Unit:", finalUnitId);

            if (finalUnitId && finalUnitId !== '' && finalUnitId !== 'null') {
                const [unitCheck] = await db.query(
                    'SELECT property_id FROM units WHERE unit_id = ?',
                    [finalUnitId]
                );

                if (unitCheck.length === 0) {
                    console.error("Unit not found:", finalUnitId);
                    return res.status(400).json({ error: 'Invalid unit selected' });
                }

                if (String(unitCheck[0].property_id) !== String(propertyId)) {
                    console.error("Unit property mismatch:", unitCheck[0].property_id, "vs", propertyId);
                    return res.status(400).json({ error: 'Selected unit does not belong to the specified property' });
                }
            }

            // Create User Account (Lead Role)
            // This will throw if email exists
            const userId = await userService.createLeadUser(name, email, phone, password);

            // Create Context Lead
            // We link the lead to the user_id immediately? The schema has `tenant_id` which references users.
            // But conceptually "Lead" is the pre-tenant stage.
            // `tenant_id` column in `leads` usually means "converted to this tenant".
            // However, since we now have a user account from the start, we could store it?
            // Re-reading schema: `tenant_id INT, -- set ONLY when converted`
            // If we want to link the Lead record to the User account RIGHT NOW, we might need a column `user_id` or just reuse `tenant_id`?
            // "tenant_id" name implies successfully converted.
            // But if the requirement is "create account -> appear in leads page", the link is useful.
            // For now, I will NOT set tenant_id yet, as the schema says "set ONLY when converted".
            // Wait, if they have an account, how do they log in and see their status?
            // The requirement says "create account... details in leads page... move to negotiation... converted... mail sent".
            // I will create the user, but maybe not link it in `leads` table until conversion?
            // OR I should use `tenant_id` to store the user_id even if not full tenant yet, but the column comment says otherwise.
            // I'll stick to creating the user. I won't link it in `leads` yet to avoid confusion with conversion logic, 
            // OR I should check if I need to link it to show "this lead has an account".
            // Actually, if I don't link it, how do we know which user corresponds to this lead? Email matching?
            // `userService` checks email.
            // Let's rely on email matching for conversion logic as implemented in `convertLeadToTenant`.

            const leadId = await leadModel.create({ ...req.body, status: 'interested' });
            res.status(201).json({ id: leadId, message: 'Account created. Please check your email to verify your account.' });
        } catch (error) {
            res.status(400).json({ error: error.message });
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
