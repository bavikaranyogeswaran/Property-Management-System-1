import { createPool } from 'mysql2';
import { config } from './config.js';
import logger from '../utils/logger.js';

const dbConfig = {
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+05:30',
  ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
};

// Use logger instead of console.log for better observability
logger.info('[DB] Connecting to database', {
  host: dbConfig.host,
  database: dbConfig.database,
  user: dbConfig.user,
});

const pool = createPool(dbConfig);

// [F2.16] Force MySQL session timezone to Sri Lanka Standard Time (+05:30)
// This ensures that CURRENT_DATE() and NOW() in SQL queries match the app server.
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+05:30'");
});

export default pool.promise();
