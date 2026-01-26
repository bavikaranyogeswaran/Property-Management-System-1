import db from '../config/db.js';

async function checkData() {
    try {
        console.log('Checking property_type_id data...');
        const [rows] = await db.query('SELECT property_id, name, property_type_id, type FROM properties');
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
