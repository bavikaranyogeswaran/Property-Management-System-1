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
      timezone: '+05:30',
      multipleStatements: true,
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
      extension: 'js',
      loadExtensions: ['.js', '.mjs'],
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
      ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
      timezone: '+05:30',
      multipleStatements: true,
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
  },
};
