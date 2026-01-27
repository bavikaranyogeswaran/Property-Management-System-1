
import db from '../config/db.js';

async function checkLeads() {
    try {
        console.log('--- Checking USERS with role=lead ---');
        const [users] = await db.query("SELECT * FROM users WHERE role = 'lead'");
        console.table(users);

        console.log('--- Checking LEADS table (Interest) ---');
        const [leads] = await db.query("SELECT * FROM leads");
        console.table(leads);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

checkLeads();
