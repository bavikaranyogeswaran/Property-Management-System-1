import db from './config/db.js';

async function checkSchema() {
    try {
        const [rows] = await db.query('DESCRIBE leases'); // MySQL syntax
        console.log('Leases Table Schema:', rows);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkSchema();
