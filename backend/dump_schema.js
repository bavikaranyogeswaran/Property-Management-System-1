
import pool from './config/db.js';

async function dumpSchema() {
    try {
        const [tables] = await pool.query('SHOW TABLES');
        const dbName = process.env.DB_NAME || 'pms_database';
        const key = `Tables_in_${dbName}`;

        // Handle case where key might be different usually Tables_in_dbname
        // Just take the first value of the object

        for (const row of tables) {
            const tableName = Object.values(row)[0];
            const [createRows] = await pool.query(`SHOW CREATE TABLE ${tableName}`);
            console.log('---');
            console.log(createRows[0]['Create Table']);
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
dumpSchema();
