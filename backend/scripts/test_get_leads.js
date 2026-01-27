
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'your_super_secret_key_change_this';
const token = jwt.sign(
    { id: 1, role: 'owner', name: 'Owner', email: 'bavikaran01@gmail.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

async function testGetLeads() {
    try {
        console.log('Fetching Leads...');
        const res = await fetch('http://localhost:3000/api/leads', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const leads = await res.json();
            console.log('Leads:', leads);
        } else {
            console.log('Error:', await res.text());
        }

    } catch (e) {
        console.error(e);
    }
}

testGetLeads();
