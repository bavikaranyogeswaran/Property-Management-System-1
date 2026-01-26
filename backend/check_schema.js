import db from './config/db.js';

async function checkSchema() {
    try {
        const [rows] = await db.query('DESCRIBE leads');
        console.log(rows);
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkSchema();
