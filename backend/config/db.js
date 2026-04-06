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

export default pool.promise();
