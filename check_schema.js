
import pool from './backend/config/db.js';

async function checkSchema() {
    try {
        const [rows] = await pool.query('SHOW CREATE TABLE users');
        console.log(rows[0]['Create Table']);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
checkSchema();
