
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'your_super_secret_key_change_this';
const token = jwt.sign(
    { id: 1, role: 'owner', name: 'Owner', email: 'bavikaran01@gmail.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

async function testDuplicateUnit() {
    try {
        // 1. Fetch Properties
        const propRes = await fetch('http://localhost:3000/api/properties', { headers: { 'Authorization': `Bearer ${token}` } });
        const props = await propRes.json();
        const propertyId = props[0].property_id || props[0].id; // Use first property

        // 2. Fetch Unit Types
        const typesRes = await fetch('http://localhost:3000/api/unit-types', { headers: { 'Authorization': `Bearer ${token}` } });
        const types = await typesRes.json();
        const typeId = types[0].type_id;

        const unitNumber = "DUP-" + Date.now(); // Unique base

        // 3. Create Unit (First Time)
        console.log('Creating Unit 1...');
        const res1 = await fetch('http://localhost:3000/api/units', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                propertyId, unitNumber, unitTypeId: typeId, monthlyRent: 15000, status: 'available'
            })
        });
        console.log('Unit 1 Status:', res1.status);


        // 4. Create Unit (Second Time - Duplicate)
        console.log('Creating Unit 2 (Duplicate)...');
        const res2 = await fetch('http://localhost:3000/api/units', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                propertyId, unitNumber, unitTypeId: typeId, monthlyRent: 15000, status: 'available'
            })
        });

        console.log('Unit 2 Status:', res2.status);
        if (!res2.ok) {
            const err = await res2.text();
            console.log('Unit 2 Error Body:', err);
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

testDuplicateUnit();
