
import db from './backend/config/db.js';

async function verifyTable() {
    try {
        console.log("Checking staff_property_assignments table...");
        const [rows] = await db.query("SHOW TABLES LIKE 'staff_property_assignments'");
        if (rows.length > 0) {
            console.log("Success: Table 'staff_property_assignments' exists.");
            // Check columns
            const [cols] = await db.query("DESCRIBE staff_property_assignments");
            console.log("Columns:", cols.map(c => c.Field).join(', '));
        } else {
            console.error("FAIL: Table 'staff_property_assignments' DOES NOT EXIST.");
        }
    } catch (err) {
        console.error("FAIL: Database error:", err.message);
    } finally {
        process.exit();
    }
}

verifyTable();
