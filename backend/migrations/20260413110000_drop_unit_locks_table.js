/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async function (knex) {
  // Migration to remove the deprecated unit_locks table (Now handled in Redis)
  return await knex.schema.dropTableIfExists('unit_locks');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async function (knex) {
  // Recreate the table if we ever need to roll back
  return await knex.schema.createTable('unit_locks', (table) => {
    table
      .integer('unit_id')
      .primary()
      .references('unit_id')
      .inTable('units')
      .onDelete('CASCADE');
    table
      .integer('lead_id')
      .notNullable()
      .references('lead_id')
      .inTable('leads')
      .onDelete('CASCADE');
    table.dateTime('expires_at').notNullable();
    table.dateTime('created_at').defaultTo(knex.fn.now());
  });
};
