
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'your_super_secret_key_change_this';
const token = jwt.sign(
    { id: 1, role: 'owner', name: 'Owner', email: 'bavikaran01@gmail.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

async function testUnitCreation() {
    try {
        // 1. Fetch Properties to get a valid IDs
        console.log('Fetching Properties...');
        const propRes = await fetch('http://localhost:3000/api/properties', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let propertyId = null;
        if (propRes.ok) {
            const props = await propRes.json();
            if (props.length > 0) {
                propertyId = props[0].property_id || props[0].id;
                console.log(`Using Property ID: ${propertyId} (${props[0].name})`);
            } else {
                console.log('No properties found. Please create one first (run previous script).');
                return;
            }
        }

        // 2. Fetch Unit Types
        console.log('Fetching Unit Types...');
        const typesRes = await fetch('http://localhost:3000/api/unit-types', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let typeId = 1;
        if (typesRes.ok) {
            const types = await typesRes.json();
            if (types.length > 0) {
                typeId = types[0].type_id;
                console.log(`Using Unit Type ID: ${typeId} (${types[0].name})`);
            }
        }

        // 3. Create Unit
        console.log('Creating Unit...');
        const payload = {
            propertyId: propertyId,
            unitNumber: "A001-" + Date.now().toString().slice(-4),
            unitTypeId: typeId,
            monthlyRent: 15000,
            status: 'available'
        };

        const res = await fetch('http://localhost:3000/api/units', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            console.log('SUCCESS: Unit created!', data);
        } else {
            const err = await res.text();
            console.error('FAILED: Status', res.status, err);
        }

    } catch (e) {
        console.error('Network Error:', e);
    }
}

testUnitCreation();
