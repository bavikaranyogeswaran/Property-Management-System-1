import db from '../config/db.js';

async function checkTables() {
    try {
        const [rows] = await db.query("SHOW TABLES LIKE 'unit_types'");
        if (rows.length > 0) {
            console.log("✅ Table 'unit_types' EXISTS.");
        } else {
            console.log("❌ Table 'unit_types' DOES NOT EXIST.");
        }
        process.exit(0);
    } catch (error) {
        console.error("Error checking tables:", error);
        process.exit(1);
    }
}

checkTables();
