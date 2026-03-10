const mysql = require('./backend/node_modules/mysql2/promise');
require('./backend/node_modules/dotenv').config({ path: './backend/.env' });
(async () => {
    try {
        const c = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
        const [rows] = await c.query('SELECT mc.*, mr.tenant_id, mr.request_id FROM maintenance_costs mc JOIN maintenance_requests mr ON mc.request_id = mr.request_id WHERE mr.tenant_id = ?', [18]);
        console.log('maintenance costs for tenant 18 (Amy):', JSON.stringify(rows));
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
