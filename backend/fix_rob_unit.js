import db from './config/db.js';
import unitModel from './models/unitModel.js';
import leaseModel from './models/leaseModel.js';
import userModel from './models/userModel.js';

async function fixRobUnit() {
    try {
        console.log('Starting Unit Status repair for Rob...');

        // 1. Find Rob
        const robEmail = 'freakone06@gmail.com';
        const user = await userModel.findByEmail(robEmail);

        if (!user) {
            console.log('Rob not found.');
            process.exit(0);
        }

        // 2. Find his lease
        const leases = await leaseModel.findByTenantId(user.user_id);
        if (leases.length === 0) {
            console.log('No lease found for Rob. Run repair_rob.js first.');
            process.exit(0);
        }

        const lease = leases[0];
        console.log(`Found Lease: ID ${lease.id} for Unit ID ${lease.unitId}`);

        // 3. Update Unit Status
        const unitId = lease.unitId;
        const result = await db.query('UPDATE units SET status = ? WHERE unit_id = ?', ['occupied', unitId]);

        console.log(`Updated Unit ${unitId} status to 'occupied'. Affected rows: ${result[0].affectedRows}`);

    } catch (error) {
        console.error('Repair failed:', error);
    } finally {
        process.exit(0);
    }
}

fixRobUnit();
