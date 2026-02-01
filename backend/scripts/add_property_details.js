import pool from '../config/db.js';

async function migrate() {
    try {
        console.log('Starting migration...');

        // Add description column
        try {
            await pool.query("ALTER TABLE properties ADD COLUMN description TEXT");
            console.log('Successfully added description column.');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('description column already exists.');
            } else {
                console.error('Error adding description column:', e.message);
            }
        }

        // Add features column
        try {
            await pool.query("ALTER TABLE properties ADD COLUMN features TEXT");
            console.log('Successfully added features column.');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('features column already exists.');
            } else {
                console.error('Error adding features column:', e.message);
            }
        }

        console.log('Migration process finished.');
        process.exit(0);
    } catch (error) {
        console.error('Migration script failed:', error);
        process.exit(1);
    }
}

migrate();
