import { createConnection } from 'mysql2';
import 'dotenv/config';

const connection = createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'pms_database2'
});

const query = "ALTER TABLE users MODIFY COLUMN role ENUM('owner','tenant','treasurer','lead') NOT NULL";

connection.query(query, (err, results) => {
    if (err) {
        console.error("Migration Failed:", err);
    } else {
        console.log("Schema Updated Successfully:", results);
    }
    connection.end();
});
