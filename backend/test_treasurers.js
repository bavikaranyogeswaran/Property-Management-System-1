
import userService from './services/userService.js';
import pool from './config/db.js';

async function testGetTreasurers() {
    try {
        console.log('Testing userService.getTreasurers()...');
        const treasurers = await userService.getTreasurers();
        console.log('Result:', JSON.stringify(treasurers, null, 2));

        console.log('\nDirect DB Query for role="treasurer":');
        const [rows] = await pool.query('SELECT * FROM users WHERE role = ?', ['treasurer']);
        console.log('DB Rows:', rows);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

testGetTreasurers();
