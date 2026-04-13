/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async function (knex) {
  // 1. Drop the legacy property features column (Logic was moved to property_amenities table)
  if (await knex.schema.hasColumn('properties', 'features')) {
    await knex.schema.table('properties', (table) => {
      table.dropColumn('features');
    });
  }

  // 2. Drop the redundant lead_access_tokens table (No longer used in the application)
  await knex.schema.dropTableIfExists('lead_access_tokens');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async function (knex) {
  // 1. Restore the features column
  if (!(await knex.schema.hasColumn('properties', 'features'))) {
    await knex.schema.table('properties', (table) => {
      table.json('features').nullable();
    });
  }

  // 2. Restore the lead_access_tokens table
  await knex.schema.createTable('lead_access_tokens', (table) => {
    table.increments('token_id').primary();
    table
      .integer('lead_id')
      .notNullable()
      .references('lead_id')
      .inTable('leads')
      .onDelete('CASCADE');
    table.string('token').unique().notNullable();
    table.datetime('expires_at').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};
