import db from '../config/db.js';

async function dropLegacyAddress() {
    try {
        console.log('Dropping legacy properties.address column...');
        try {
            await db.query(`ALTER TABLE properties DROP COLUMN address`);
            console.log('Dropped properties.address successfully.');
        } catch (e) {
            console.log('Error dropping properties.address (maybe already dropped):', e.message);
        }
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

dropLegacyAddress();
