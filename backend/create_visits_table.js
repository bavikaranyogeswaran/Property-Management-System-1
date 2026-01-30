
import db from './config/db.js';

const createTableQuery = `
CREATE TABLE IF NOT EXISTS property_visits (
    visit_id INT AUTO_INCREMENT PRIMARY KEY,
    property_id INT NOT NULL,
    unit_id INT NULL,
    lead_id INT NULL,
    visitor_name VARCHAR(100) NOT NULL,
    visitor_email VARCHAR(100) NOT NULL,
    visitor_phone VARCHAR(20) NOT NULL,
    scheduled_date DATETIME NOT NULL,
    status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'pending',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(property_id),
    FOREIGN KEY (unit_id) REFERENCES units(unit_id),
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE SET NULL
);
`;

async function run() {
    try {
        console.log('Creating property_visits table...');
        await db.execute(createTableQuery);
        console.log('Table created successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error creating table:', error);
        process.exit(1);
    }
}

run();
