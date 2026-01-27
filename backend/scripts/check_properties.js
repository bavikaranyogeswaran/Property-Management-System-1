
import db from '../config/db.js';

async function checkProperties() {
    try {
        const [rows] = await db.query('SELECT * FROM properties');
        console.log('--- Properties ---');
        console.table(rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

checkProperties();
