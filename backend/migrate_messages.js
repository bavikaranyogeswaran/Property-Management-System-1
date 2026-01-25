import { createConnection } from 'mysql2';
import 'dotenv/config';

const connection = createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'pms_database2'
});

const createMessagesTable = `
CREATE TABLE IF NOT EXISTS messages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    lead_id INT NOT NULL,
    sender_id INT NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE
);
`;

connection.query(createMessagesTable, (err, results) => {
    if (err) {
        console.error("Migration Failed:", err);
    } else {
        console.log("Messages Table Created Successfully:", results);
    }
    connection.end();
});
