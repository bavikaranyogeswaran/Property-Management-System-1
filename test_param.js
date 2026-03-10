
import db from './backend/config/db.js';

async function testConnection() {
    try {
        console.log("Testing DB connection...");
        const [rows] = await db.query('SELECT 1 as val');
        console.log("Success: Connection works. Val:", rows[0].val);

        console.log("Checking unit_types count...");
        const [types] = await db.query('SELECT COUNT(*) as count FROM unit_types');
        console.log("Unit Types Count:", types[0].count);

        console.log("Testing query with undefined param...");
        await db.query('SELECT ? as val', [undefined]);
        console.log("Success: undefined param worked (became NULL?)");

    } catch (err) {
        console.error("FAIL:", err.message);
    } finally {
        process.exit();
    }
}

testConnection();
