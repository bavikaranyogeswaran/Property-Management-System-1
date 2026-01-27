
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'your_super_secret_key_change_this';
const token = jwt.sign(
    { id: 1, role: 'owner', name: 'Owner', email: 'bavikaran01@gmail.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

async function testPropertyCreation() {
    try {
        // 1. Get a Property Type ID
        console.log('Fetching Property Types...');
        const typesRes = await fetch('http://localhost:3000/api/property-types', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let typeId = 1;
        if (typesRes.ok) {
            const types = await typesRes.json();
            if (types.length > 0) {
                typeId = types[0].type_id;
                console.log(`Using Property Type ID: ${typeId} (${types[0].name})`);
            } else {
                console.log('No property types found. Using ID 1.');
            }
        } else {
            console.log('Failed to fetch types, using default ID 1. Status:', typesRes.status);
            // Note: route might be /api/properties/types based on Step 203: router.get('/types', ...)
            // Yes, propertyRoutes is mounted at /api/properties? Need to check index.js but unsafe to assume. 
            // Actually Step 203 shows propertyRoutes has `router.get('/types'...)`. 
            // If server.js mounts it at /api/properties, then URL is correct.
        }

        // 2. Create Property
        console.log('Creating Property with new address fields...');
        const payload = {
            name: "Debug Property " + Date.now(),
            propertyTypeId: typeId,
            propertyNo: "123",
            street: "Debug St",
            city: "Debug City",
            district: "Debug District"
        };

        const res = await fetch('http://localhost:3000/api/properties', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            console.log('SUCCESS: Property created!', data);
        } else {
            const err = await res.text();
            console.error('FAILED: Status', res.status, err);
        }

    } catch (e) {
        console.error('Network Error:', e);
    }
}

testPropertyCreation();
