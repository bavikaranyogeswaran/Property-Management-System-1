
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'your_super_secret_key_change_this';
const token = jwt.sign(
    { id: 1, role: 'owner', name: 'Owner', email: 'bavikaran01@gmail.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

console.log('Generated Token:', token);

async function testApi() {
    try {
        console.log('Testing POST /api/property-types...');
        const response = await fetch('http://localhost:3000/api/property-types', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: 'Test Type ' + Date.now(), description: 'Test desc' })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('Success:', response.status, data);
        } else {
            const errText = await response.text();
            console.error('Error:', response.status, errText);
        }
    } catch (error) {
        console.error('Fetch Error:', error);
    }
}

testApi();
