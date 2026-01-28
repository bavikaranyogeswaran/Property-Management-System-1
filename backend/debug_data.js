import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

async function run() {
    try {
        console.log("--- DEBUG START ---");
        const dbModule = await import('./config/db.js');
        const db = dbModule.default;

        console.log("DB Name:", process.env.DB_NAME);

        console.log("\n--- DESCRIBE leads ---");
        try {
            const [leadsCols] = await db.query("DESCRIBE leads");
            console.log("Leads Columns:", leadsCols.map(c => c.Field));
        } catch (e) { console.log("leads error:", e.message); }

        console.log("\n--- DESCRIBE users ---");
        try {
            const [usersCols] = await db.query("DESCRIBE users");
            console.log("Users Columns:", usersCols.map(c => c.Field));
        } catch (e) { console.log("users error:", e.message); }

        console.log("\n--- DESCRIBE leases ---");
        try {
            const [leasesCols] = await db.query("DESCRIBE leases");
            console.log("Leases Columns:", leasesCols.map(c => c.Field));
        } catch (e) { console.log("leases error:", e.message); }

        console.log("\n--- DESCRIBE properties ---");
        try {
            const [propsCols] = await db.query("DESCRIBE properties");
            console.log("Properties Columns:", propsCols.map(c => c.Field));
        } catch (e) { console.log("properties error:", e.message); }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
}

run();
