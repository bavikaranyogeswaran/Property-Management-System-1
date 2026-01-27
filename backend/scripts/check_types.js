
import db from '../config/db.js';

async function checkTypes() {
    try {
        const [rows] = await db.query('SELECT * FROM unit_types');
        console.log('Unit Types:', rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

checkTypes();
