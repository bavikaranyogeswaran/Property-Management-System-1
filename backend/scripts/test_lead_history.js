import db from '../config/db.js';
import leadStageHistoryModel from '../models/leadStageHistoryModel.js';

async function testLeadStageHistory() {
    try {
        console.log('=== Testing Lead Stage History ===\n');

        // Step 1: Check existing leads and their history
        console.log('Step 1: Checking existing leads...');
        const [existingLeads] = await db.query('SELECT lead_id, name, status, created_at FROM leads ORDER BY lead_id');
        console.table(existingLeads);

        if (existingLeads.length > 0) {
            const leadId = existingLeads[0].lead_id;
            console.log(`\nChecking history for Lead ID ${leadId} (${existingLeads[0].name}):`);
            const history = await leadStageHistoryModel.findByLeadId(leadId);

            if (history.length === 0) {
                console.log('❌ No history found for this lead (created before history tracking was implemented)');
                console.log('   Creating initial history record...');
                await leadStageHistoryModel.create(leadId, null, existingLeads[0].status, 'Backfilled from existing lead');
                const newHistory = await leadStageHistoryModel.findByLeadId(leadId);
                console.table(newHistory);
            } else {
                console.table(history);
            }
        }

        // Step 2: Backfill history for all existing leads without history
        console.log('\n\nStep 2: Backfilling history for leads without history records...');
        const [leadsWithoutHistory] = await db.query(`
            SELECT l.lead_id, l.name, l.status, l.created_at
            FROM leads l
            LEFT JOIN lead_stage_history lsh ON l.lead_id = lsh.lead_id
            WHERE lsh.history_id IS NULL
        `);

        if (leadsWithoutHistory.length > 0) {
            console.log(`Found ${leadsWithoutHistory.length} lead(s) without history:`);
            console.table(leadsWithoutHistory);

            for (const lead of leadsWithoutHistory) {
                await leadStageHistoryModel.create(
                    lead.lead_id,
                    null,
                    lead.status,
                    'Backfilled from existing lead'
                );
                console.log(`✅ Created history for Lead ID ${lead.lead_id} (${lead.name})`);
            }
        } else {
            console.log('✅ All leads have history records!');
        }

        // Step 3: Display all history
        console.log('\n\nStep 3: All lead stage history:');
        const allHistory = await leadStageHistoryModel.findAll();
        console.table(allHistory);

        console.log('\n✅ Test completed!');
        console.log('\nNext steps:');
        console.log('1. Create a new lead via the Public Listing page');
        console.log('2. Check that it appears in lead_stage_history with from_status = NULL');
        console.log('3. Update the lead status in the Leads page');
        console.log('4. Check that a new history record is created with the status transition');

    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        process.exit();
    }
}

testLeadStageHistory();
