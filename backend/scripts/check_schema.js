import db from '../config/db.js';

async function checkSchema() {
    try {
        const [rows] = await db.query("DESCRIBE properties");
        console.log("Properties Table Schema:");
        console.table(rows);
        process.exit(0);
    } catch (error) {
        console.error("Error checking schema:", error);
        process.exit(1);
    }
}

checkSchema();
