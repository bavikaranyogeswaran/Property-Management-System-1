
import db from '../config/db.js';

async function migrateAddress() {
    try {
        console.log('Starting address structure migration...');

        // Add new columns
        const addColumnsQuery = `
            ALTER TABLE properties
            ADD COLUMN property_no VARCHAR(50) AFTER name,
            ADD COLUMN street VARCHAR(255) AFTER property_no,
            ADD COLUMN city VARCHAR(100) AFTER street,
            ADD COLUMN district VARCHAR(100) AFTER city;
        `;

        try {
            await db.query(addColumnsQuery);
            console.log('added new columns successfully.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('Columns already exist, skipping add.');
            } else {
                throw err;
            }
        }

        // Optional: Attempt to migrate existing data?
        // Since old data is just one string "address", it's hard to split perfectly.
        // We will just leave them null for now, or copy the whole address to "street".

        console.log('Migrating existing address to street column...');
        await db.query(`UPDATE properties SET street = address WHERE street IS NULL`);

        console.log('Migration complete.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrateAddress();
