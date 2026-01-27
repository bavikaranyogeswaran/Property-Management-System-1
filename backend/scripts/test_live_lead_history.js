import jwt from 'jsonwebtoken';

const JWT_SECRET = 'your_super_secret_key_change_this';

async function testLiveLeadCreationAndUpdate() {
    try {
        console.log('=== Testing Live Lead Creation & Status Update ===\n');

        // Create owner token
        const ownerToken = jwt.sign(
            { id: 1, role: 'owner', name: 'Owner', email: 'bavikaran01@gmail.com' },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Step 1: Create a new lead via API
        console.log('Step 1: Creating a new lead via API...');
        const createResponse = await fetch('http://localhost:3000/api/leads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'Test History User',
                email: 'historytest@example.com',
                phone: '+94771234567',
                propertyId: '3',
                unitId: '8',
                password: 'Test1234!'
            })
        });

        if (!createResponse.ok) {
            const error = await createResponse.text();
            console.log('❌ Failed to create lead:', error);
            return;
        }

        const createResult = await createResponse.json();
        console.log('✅ Lead created:', createResult);
        const leadId = createResult.id;

        // Step 2: Check history was created
        console.log('\nStep 2: Waiting 1 second then checking history...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const historyResponse = await fetch(`http://localhost:3000/api/leads`, {
            headers: { 'Authorization': `Bearer ${ownerToken}` }
        });
        const leads = await historyResponse.json();
        const newLead = leads.find(l => l.id === leadId);
        console.log('Lead from API:', newLead);

        // Step 3: Update status
        console.log('\nStep 3: Updating lead status to "converted"...');
        const updateResponse = await fetch(`http://localhost:3000/api/leads/${leadId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                status: 'converted',
                notes: 'Converted during history test'
            })
        });

        if (!updateResponse.ok) {
            const error = await updateResponse.text();
            console.log('❌ Failed to update lead:', error);
            return;
        }

        console.log('✅ Lead updated');

        // Step 4: Verify history in database
        console.log('\nStep 4: Checking database for history records...');
        await new Promise(resolve => setTimeout(resolve, 500));

        const db = (await import('../config/db.js')).default;
        const [historyRecords] = await db.query(
            `SELECT * FROM lead_stage_history WHERE lead_id = ? ORDER BY changed_at`,
            [leadId]
        );

        console.log('\n📊 History Records:');
        console.table(historyRecords);

        if (historyRecords.length === 2) {
            console.log('\n✅ SUCCESS! Expected 2 history records found:');
            console.log('   1. Initial creation: from_status = NULL, to_status = "interested"');
            console.log('   2. Status update: from_status = "interested", to_status = "converted"');
        } else {
            console.log(`\n⚠️  Warning: Expected 2 records but found ${historyRecords.length}`);
        }

        process.exit();

    } catch (e) {
        console.error('❌ Error:', e);
        process.exit(1);
    }
}

testLiveLeadCreationAndUpdate();
