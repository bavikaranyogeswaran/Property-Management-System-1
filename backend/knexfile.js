import 'dotenv/config';

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
export default {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password:
        process.env.DB_PASSWORD !== undefined
          ? process.env.DB_PASSWORD
          : 'password',
      database: process.env.DB_NAME || 'pms_database',
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
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl:
        process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
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
