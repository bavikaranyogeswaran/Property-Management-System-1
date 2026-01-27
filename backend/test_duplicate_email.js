
import userService from './services/userService.js';
import pool from './config/db.js';

async function testDuplicateEmail() {
    try {
        const email = 'test_duplicate@example.com';
        const randomSuffix = Math.floor(Math.random() * 10000);
        const emailToUse = `test_${randomSuffix}@example.com`;

        console.log(`Creating first user with email: ${emailToUse}`);
        await userService.createTreasurer('Test User 1', emailToUse, '1234567890', 'password');
        console.log('First user created successfully.');

        console.log(`Attempting to create second user with SAME email: ${emailToUse}`);
        await userService.createTreasurer('Test User 2', emailToUse, '0987654321', 'password');

    } catch (error) {
        console.log('Caught Expected Error:', error.message);
    } finally {
        process.exit();
    }
}

testDuplicateEmail();
