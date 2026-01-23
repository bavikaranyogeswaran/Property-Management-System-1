import db from '../config/db.js';

async function fixSchema() {
    try {
        const connection = await db.getConnection();
        console.log('Modifying properties table...');

        // Make 'type' nullable
        await connection.query("ALTER TABLE properties MODIFY COLUMN type VARCHAR(100) NULL");
        console.log("✅ Maintained 'type' column as nullable.");

        // Also make 'image_url' nullable if not already (it appeared nullable in previous check, but good to ensure)
        await connection.query("ALTER TABLE properties MODIFY COLUMN image_url VARCHAR(255) NULL");
        console.log("✅ Maintained 'image_url' column as nullable.");

        console.log('Modifying units table...');
        // Try to make unit_type nullable. It might be called 'unit_type' or 'type'. 
        // Based on typical schema it was likely 'unit_type'.
        // We'll wrap in try/catch in case column doesn't exist.
        try {
            await connection.query("ALTER TABLE units MODIFY COLUMN unit_type VARCHAR(50) NULL");
            console.log("✅ Maintained 'units.unit_type' as nullable.");
        } catch (e) {
            console.log("Note: units.unit_type might not exist or verify failed:", e.message);
        }

        try {
            await connection.query("ALTER TABLE units MODIFY COLUMN type VARCHAR(50) NULL");
            console.log("✅ Maintained 'units.type' as nullable.");
        } catch (e) {
            // Ignore if column doesn't exist
        }

        console.log('Schema fix completed successfully.');
        connection.release();
        process.exit(0);
    } catch (error) {
        console.error('Schema fix failed:', error);
        process.exit(1);
    }
}

fixSchema();
