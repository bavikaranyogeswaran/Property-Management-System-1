import { createPool } from 'mysql2';
import 'dotenv/config';

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : 'password',
    database: process.env.DB_NAME || 'pms_database',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+05:30'
};

console.log('[DEBUG] DB Config:', { ...dbConfig, password: '***' });

const pool = createPool(dbConfig);

export default pool.promise();
