/**
 * Test script to verify owner-based filtering using Models
 */

import pool from '../config/db.js';
import leadModel from '../models/leadModel.js';
import leadStageHistoryModel from '../models/leadStageHistoryModel.js';
import userModel from '../models/userModel.js';

async function testOwnerFiltering() {
    console.log('=== Testing Owner-Based Data Scoping (via Models) ===\n');

    try {
        // Get all owners
        const [owners] = await pool.query('SELECT user_id, name, email FROM users WHERE role = "owner"');
        console.log(`Found ${owners.length} owners in the system`);

        if (owners.length === 0) {
            console.log('No owners found. Please create an owner first.');
            return;
        }

        // Test with the first owner
        const owner = owners[0];
        console.log(`\nTesting with owner: ${owner.name} (ID: ${owner.user_id})\n`);

        // Test 1: Properties (manual check as reference)
        const [properties] = await pool.query(
            'SELECT property_id, name FROM properties WHERE owner_id = ?',
            [owner.user_id]
        );
        console.log(`Reference: Owner has ${properties.length} properties.`);

        // Test 2: Leads via leadModel
        const leads = await leadModel.findAll(owner.user_id);
        console.log(`\n✓ leadModel.findAll returned ${leads.length} leads:`);
        leads.forEach(l => console.log(`  - ${l.name} (${l.email}) - ${l.status}`));

        // Test 3: History via leadStageHistoryModel
        const history = await leadStageHistoryModel.findAll(owner.user_id);
        console.log(`\n✓ leadStageHistoryModel.findAll returned ${history.length} records:`);
        history.slice(0, 3).forEach(h => {
            const transition = h.fromStatus
                ? `${h.fromStatus} → ${h.toStatus}`
                : `Created as ${h.toStatus}`;
            console.log(`  - Lead #${h.leadId}: ${transition}`);
        });

        // Test 4: Tenants via userModel (The critical fix)
        const tenants = await userModel.findTenantsByOwner(owner.user_id);
        console.log(`\n✓ userModel.findTenantsByOwner returned ${tenants.length} tenants:`);
        tenants.forEach(t => console.log(`  - ${t.name} (${t.email}) - Status: ${t.status}`));

        if (tenants.length > 0) {
            console.log('\nSUCCESS: Tenants are visible!');
        } else {
            console.log('\nWARNING: 0 Tenants found. Please verify if this is expected.');
        }

    } catch (error) {
        console.error('❌ Error during testing:', error.message);
        console.error(error);
    } finally {
        await pool.end();
        process.exit();
    }
}

testOwnerFiltering();
