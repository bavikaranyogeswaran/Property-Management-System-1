import db from '../config/db.js';

async function checkSchema() {
    try {
        console.log('Checking schema for properties table...');
        const [rows] = await db.query('DESCRIBE properties');
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
