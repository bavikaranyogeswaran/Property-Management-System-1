import { createConnection } from 'mysql2/promise';
import 'dotenv/config';

const connection = await createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'pms_database2'
});

async function runHelper() {
    try {
        console.log("Adding is_email_verified column...");
        await connection.query("ALTER TABLE users ADD COLUMN is_email_verified BOOLEAN DEFAULT FALSE");
        console.log("Added is_email_verified.");
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log("Column is_email_verified already exists.");
        } else {
            console.error("Error adding is_email_verified:", err.message);
        }
    }

    try {
        console.log("Adding email_verified_at column...");
        await connection.query("ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP NULL");
        console.log("Added email_verified_at.");
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log("Column email_verified_at already exists.");
        } else {
            console.error("Error adding email_verified_at:", err.message);
        }
    }

    // Optional: Set existing users to verified so they don't get locked out?
    // User requested "better implementation", implying new flow.
    // But existing users should probably be verified.
    try {
        console.log("Marking existing users as verified...");
        await connection.query("UPDATE users SET is_email_verified = TRUE WHERE is_email_verified IS FALSE");
        console.log("Existing users verified.");
    } catch (err) {
        console.error("Error updating existing users:", err.message);
    }

    await connection.end();
}

runHelper();
