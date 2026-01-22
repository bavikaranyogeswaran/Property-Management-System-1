
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api';

async function reproduce() {
    console.log('--- Starting Enhanced Reproduction Script ---');

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
        throw new Error(`Owner Login Failed: ${await loginResponse.text()}`);
    }

    const { token } = await loginResponse.json();
    console.log('Owner Login Successful.');

    // 2. Create Treasurer (Unique email every time to avoid manual cleanup or duplicate errors confusing the first run)
    // Actually, let's use a fixed one to test duplicate handling, but for now I want to test successful login.
    // I'll use a random email.
    const uniqueId = Date.now();
    const treasurerEmail = `treasurer_${uniqueId}@example.com`;
    const treasurerPassword = 'password123';

    console.log(`2. Creating Treasurer (${treasurerEmail})...`);
    const createResponse = await fetch(`${BASE_URL}/users/create-treasurer`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` // Owner token
        },
        body: JSON.stringify({
            name: 'Test Treasurer',
            email: treasurerEmail,
            password: treasurerPassword
        })
    });

    console.log(`Create Status: ${createResponse.status}`);
    const createBody = await createResponse.text();
    console.log('Create Response:', createBody);

    if (!createResponse.ok) {
        throw new Error('Failed to create treasurer');
    }

    // 3. Login as the NEW Treasurer
    console.log('3. Attempting to log in as new Treasurer...');
    const treasurerLoginResponse = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: treasurerEmail,
            password: treasurerPassword
        })
    });

    console.log(`Treasurer Login Status: ${treasurerLoginResponse.status}`);
    const treasurerLoginBody = await treasurerLoginResponse.text();
    console.log('Treasurer Login Response:', treasurerLoginBody);

    if (treasurerLoginResponse.ok) {
        console.log('SUCCESS: Treasurer registered and logged in successfully.');
    } else {
        console.error('FAILURE: Treasurer could not log in. Hashing or DB issue?');
    }
}

reproduce().catch(err => console.error('Script Error:', err));
