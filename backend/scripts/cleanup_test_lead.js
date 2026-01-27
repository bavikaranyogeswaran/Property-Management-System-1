import db from '../config/db.js';

async function cleanupTestLead() {
    try {
        console.log('Cleaning up Test History User...\n');

        // Find the lead
        const [leads] = await db.query(
            "SELECT lead_id FROM leads WHERE email = 'historytest@example.com'"
        );

        if (leads.length === 0) {
            console.log('✅ Test lead not found - already cleaned up or never created.');
            process.exit(0);
        }

        const leadId = leads[0].lead_id;
        console.log(`Found Lead ID: ${leadId}`);

        // Delete from lead_stage_history
        const [historyResult] = await db.query(
            'DELETE FROM lead_stage_history WHERE lead_id = ?',
            [leadId]
        );
        console.log(`✅ Deleted ${historyResult.affectedRows} history record(s)`);

        // Delete from leads
        const [leadsResult] = await db.query(
            'DELETE FROM leads WHERE lead_id = ?',
            [leadId]
        );
        console.log(`✅ Deleted ${leadsResult.affectedRows} lead record(s)`);

        // Delete from users
        const [usersResult] = await db.query(
            "DELETE FROM users WHERE email = 'historytest@example.com'"
        );
        console.log(`✅ Deleted ${usersResult.affectedRows} user record(s)`);

        console.log('\n✅ Cleanup complete! Test History User removed from database.');

    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        process.exit();
    }
}

cleanupTestLead();
