import db from './config/db.js';
async function check() {
    const [rows] = await db.query('DESCRIBE leads');
    console.log(rows);
    process.exit(0);
}
check();
