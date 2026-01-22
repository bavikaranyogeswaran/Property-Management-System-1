
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api';

async function reproduce() {
    console.log('--- Starting Reproduction Script ---');

    // 1. Login as Owner
    console.log('1. Logging in as Owner...');
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'bavikaran01@gmail.com',
            password: 'owner123'
        })
    });

    if (!loginResponse.ok) {
        console.error('Login Failed:', await loginResponse.text());
        return;
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('Login Successful. Token received.');

    // 2. Create Treasurer
    console.log('2. Creating Treasurer...');
    const treasurerData = {
        name: 'Test Treasurer',
        email: 'treasurer_test@example.com',
        password: 'password123'
    };

    const createResponse = await fetch(`${BASE_URL}/users/create-treasurer`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(treasurerData)
    });

    const createText = await createResponse.text();
    console.log(`Status: ${createResponse.status}`);
    console.log('Response:', createText);

    if (createResponse.ok) {
        console.log('SUCCESS: Treasurer created.');
    } else {
        console.log('FAILURE: Failed to create treasurer.');
    }
}

reproduce().catch(console.error);
