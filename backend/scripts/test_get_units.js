
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'your_super_secret_key_change_this';
const token = jwt.sign(
    { id: 1, role: 'owner', name: 'Owner', email: 'bavikaran01@gmail.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

async function testGetUnits() {
    try {
        console.log('Fetching Units...');
        const res = await fetch('http://localhost:3000/api/units', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const units = await res.json();
            console.log('Units:', units);
            if (units.length === 0) {
                console.log("API returned 0 units, despite DB having them.");
                console.log("Possible JOIN failure.");
            }
        } else {
            console.log('Error:', await res.text());
        }

    } catch (e) {
        console.error(e);
    }
}

testGetUnits();
