import db from './config/db.js';
import userModel from './models/userModel.js';
import leadModel from './models/leadModel.js';
import unitModel from './models/unitModel.js';
import leaseModel from './models/leaseModel.js';

async function repairRob() {
    try {
        console.log('Starting repair for Rob...');

        // 1. Find Rob
        const robEmail = 'freakone06@gmail.com';
        const user = await userModel.findByEmail(robEmail);

        if (!user) {
            console.log('Rob not found in Users table.');
            process.exit(0);
        }
        console.log(`Found User: ${user.name} (ID: ${user.user_id})`);

        // 2. Find Converted Lead
        // Query DB directly to get raw columns
        const [leadRows] = await db.query('SELECT * FROM leads WHERE email = ?', [robEmail]);
        const lead = leadRows[0];

        if (!lead) {
            console.log('No lead found for Rob.');
            process.exit(0);
        }
        console.log(`Found Lead: ID ${lead.lead_id}, Interested Unit ID (unit_id): ${lead.unit_id}`);

        if (!lead.unit_id) {
            console.log('Lead has no interested unit (unit_id). Cannot create lease.');
            process.exit(0);
        }

        // 3. Check for existing lease
        const leases = await leaseModel.findByTenantId(user.user_id);
        if (leases.length > 0) {
            console.log(`Lease already exists for Rob (Lease ID: ${leases[0].id}).`);
            process.exit(0);
        }

        // 4. Create Lease
        const unit = await unitModel.findById(lead.unit_id);
        if (!unit) {
            console.log('Unit not found.');
            process.exit(0);
        }

        const today = new Date();
        const nextYear = new Date(today);
        nextYear.setFullYear(today.getFullYear() + 1);

        const leaseId = await leaseModel.create({
            tenantId: user.user_id,
            unitId: lead.unit_id,
            startDate: today.toISOString().split('T')[0],
            endDate: nextYear.toISOString().split('T')[0],
            monthlyRent: unit.monthlyRent,
            status: 'active'
        });

        console.log(`Successfully created Lease (ID: ${leaseId}) for Rob!`);

    } catch (error) {
        console.error('Repair failed:', error);
    } finally {
        process.exit(0);
    }
}

repairRob();
