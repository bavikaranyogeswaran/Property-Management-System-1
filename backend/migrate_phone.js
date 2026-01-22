import pool from './config/db.js';

async function migrate() {
    try {
        console.log('Checking if phone column exists...');
        const [columns] = await pool.query("SHOW COLUMNS FROM users LIKE 'phone'");

        if (columns.length === 0) {
            console.log('Adding phone column to users table...');
            await pool.query("ALTER TABLE users ADD COLUMN phone VARCHAR(20) AFTER email");
            console.log('Migration successful: phone column added.');
        } else {
            console.log('Phone column already exists. Skipping...');
        }
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
