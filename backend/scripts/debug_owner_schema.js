import db from '../config/db.js';

async function checkSchema() {
    try {
        const [rows] = await db.query('DESCRIBE owners');
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
