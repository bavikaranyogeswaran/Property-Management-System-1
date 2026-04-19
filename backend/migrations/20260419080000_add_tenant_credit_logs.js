/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable('tenant_credit_logs', (table) => {
    table.increments('log_id').primary();
    table.integer('tenant_id').notNullable();
    table.bigInteger('amount_change').notNullable(); // in cents (match schema.sql which used BIGINT)
    table.string('reason', 100).notNullable();
    table.integer('reference_id');

    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('user_id').inTable('users');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('tenant_credit_logs');
};
