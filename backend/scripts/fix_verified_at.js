import { createConnection } from 'mysql2/promise';
import 'dotenv/config';

const connection = await createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'pms_database2'
});

async function runFix() {
    try {
        console.log("Backfilling email_verified_at for existing verified users...");
        const [result] = await connection.query(
            "UPDATE users SET email_verified_at = NOW() WHERE is_email_verified = TRUE AND email_verified_at IS NULL"
        );
        console.log(`Updated ${result.affectedRows} users.`);
    } catch (err) {
        console.error("Error updating users:", err.message);
    }
    await connection.end();
}

runFix();
