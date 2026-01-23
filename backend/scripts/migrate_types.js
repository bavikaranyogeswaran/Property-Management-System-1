import db from '../config/db.js';

async function migrate() {
    console.log('Starting migration...');

    try {
        const connection = await db.getConnection();

        console.log('Creating property_types table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS property_types (
                type_id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                description VARCHAR(255)
            )
        `);

        console.log('Creating unit_types table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS unit_types (
                type_id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                description VARCHAR(255)
            )
        `);

        console.log('Creating property_images table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS property_images (
                image_id INT AUTO_INCREMENT PRIMARY KEY,
                property_id INT NOT NULL,
                image_url VARCHAR(500) NOT NULL,
                is_primary BOOLEAN DEFAULT FALSE,
                display_order INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE
            )
        `);

        console.log('Creating unit_images table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS unit_images (
                image_id INT AUTO_INCREMENT PRIMARY KEY,
                unit_id INT NOT NULL,
                image_url VARCHAR(500) NOT NULL,
                is_primary BOOLEAN DEFAULT FALSE,
                display_order INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE
            )
        `);

        // Add foreign keys if they don't exist
        // Note: checking specifically for column existence is harder in generic SQL, 
        // so we attempt ALTER and ignore duplicate column error or we can inspect information_schema.
        // For simplicity, we'll try to add them and catch errors if they exist.

        try {
            console.log('Adding property_type_id to properties...');
            await connection.query(`
                ALTER TABLE properties 
                ADD COLUMN property_type_id INT NULL,
                ADD CONSTRAINT fk_property_type FOREIGN KEY (property_type_id) REFERENCES property_types(type_id)
            `);
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('Column property_type_id already exists.');
            } else {
                console.log('Note on properties alter:', e.message);
            }
        }

        try {
            console.log('Adding unit_type_id to units...');
            await connection.query(`
                ALTER TABLE units 
                ADD COLUMN unit_type_id INT NULL,
                ADD CONSTRAINT fk_unit_type FOREIGN KEY (unit_type_id) REFERENCES unit_types(type_id)
            `);
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('Column unit_type_id already exists.');
            } else {
                console.log('Note on units alter:', e.message);
            }
        }

        console.log('Migration completed successfully.');
        connection.release();
        process.exit(0);

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
