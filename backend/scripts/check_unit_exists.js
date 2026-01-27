
import db from '../config/db.js';

async function checkUnit() {
    try {
        const [rows] = await db.query('SELECT * FROM units WHERE unit_number = ?', ['A002']);
        console.log('Found units with A002:', rows.map(u => ({ id: u.unit_id, no: u.unit_number, prop: u.property_id })));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

checkUnit();
