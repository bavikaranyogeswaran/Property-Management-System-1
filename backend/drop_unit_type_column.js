
import pool from './config/db.js';

async function dropUnitTypeColumn() {
    try {
        console.log('Checking if unit_type column exists...');
        const [rows] = await pool.query("SHOW COLUMNS FROM units LIKE 'unit_type'");

        if (rows.length === 0) {
            console.log('Column unit_type does not exist. Already normalized?');
            return;
        }

        console.log('Dropping column unit_type...');
        await pool.query('ALTER TABLE units DROP COLUMN unit_type');
        console.log('Column dropped successfully.');

        console.log('Verifying schema...');
        const [cols] = await pool.query("SHOW COLUMNS FROM units LIKE 'unit_type'");
        if (cols.length === 0) {
            console.log('SUCCESS: unit_type column is gone.');
        } else {
            console.error('FAILURE: unit_type column still exists.');
        }

    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        process.exit();
    }
}
dropUnitTypeColumn();
