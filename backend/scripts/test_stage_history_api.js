import jwt from 'jsonwebtoken';

const JWT_SECRET = 'your_super_secret_key_change_this';
const token = jwt.sign(
    { id: 1, role: 'owner', name: 'Owner', email: 'bavikaran01@gmail.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

async function testStageHistoryEndpoint() {
    try {
        console.log('Testing GET /api/leads/stage-history...\n');
        const res = await fetch('http://localhost:3000/api/leads/stage-history', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const history = await res.json();
            console.log(`✅ Endpoint working! Found ${history.length} history record(s):\n`);
            console.table(history);
        } else {
            console.log('❌ Error:', await res.text());
        }

    } catch (e) {
        console.error('❌ Error:', e);
    }
}

testStageHistoryEndpoint();
