import { config } from './config/config.js';

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
export default {
  development: {
    client: 'mysql2',
    connection: {
      host: config.db.host,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      port: config.db.port,
      timezone: '+05:30',
      multipleStatements: true,
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
      extension: 'js',
      loadExtensions: ['.js', '.mjs'],
    },
    pool: {
      afterCreate: (conn, cb) => {
        conn.query("SET time_zone = '+05:30'", (err) => cb(err, conn));
      },
    },
    useNullAsDefault: true,
  },
  test: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'rootpassword',
      database: process.env.DB_NAME || 'pms_test_db',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      timezone: '+05:30',
      multipleStatements: true,
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
      extension: 'js',
      loadExtensions: ['.js', '.mjs'],
    },
    pool: {
      afterCreate: (conn, cb) => {
        conn.query("SET time_zone = '+05:30'", (err) => cb(err, conn));
      },
    },
    useNullAsDefault: true,
  },

  production: {
    client: 'mysql2',
    connection: {
      host: config.db.host,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      port: config.db.port,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
      timezone: '+05:30',
      multipleStatements: true,
    },
    pool: {
      min: 2,
      max: 10,
      afterCreate: (conn, cb) => {
        conn.query("SET time_zone = '+05:30'", (err) => cb(err, conn));
      },
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
  },
};
