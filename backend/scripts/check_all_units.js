
import db from '../config/db.js';

async function checkAllUnits() {
    try {
        const [rows] = await db.query('SELECT unit_id, property_id, unit_number, unit_type_id, status FROM units');
        console.log('--- Database Units ---');
        console.table(rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

checkAllUnits();
