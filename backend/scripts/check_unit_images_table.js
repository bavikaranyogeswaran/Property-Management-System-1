
import db from '../config/db.js';

async function checkTable() {
    try {
        const [rows] = await db.query('DESCRIBE unit_images');
        console.log('unit_images table exists. Columns:', rows.map(r => r.Field));
    } catch (e) {
        console.error('Check failed:', e.message);
    } finally {
        process.exit();
    }
}

checkTable();
