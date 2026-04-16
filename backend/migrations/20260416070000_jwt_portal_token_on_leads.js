/**
 * Replaces the `lead_access_tokens` table with a single `portal_token` column
 * on the `leads` table.
 *
 * WHY: The previous approach stored tokens in a separate table. Signed JWTs
 * are self-expiring, so no `expires_at` column is needed — a single nullable
 * column on `leads` satisfies 3NF (portal_token depends only on lead_id).
 * Revocation is achieved by NULLing the column.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async function (knex) {
  // 1. Add portal_token column to leads
  if (!(await knex.schema.hasColumn('leads', 'portal_token'))) {
    await knex.schema.alterTable('leads', (table) => {
      table.string('portal_token', 512).nullable().defaultTo(null);
    });
  }

  // 2. Drop the now-redundant lead_access_tokens table
  await knex.schema.dropTableIfExists('lead_access_tokens');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async function (knex) {
  // 1. Remove portal_token column from leads
  if (await knex.schema.hasColumn('leads', 'portal_token')) {
    await knex.schema.alterTable('leads', (table) => {
      table.dropColumn('portal_token');
    });
  }

  // 2. Recreate the lead_access_tokens table (full schema)
  if (!(await knex.schema.hasTable('lead_access_tokens'))) {
    await knex.schema.createTable('lead_access_tokens', (table) => {
      table.increments('token_id').primary();
      table
        .integer('lead_id')
        .notNullable()
        .references('lead_id')
        .inTable('leads')
        .onDelete('CASCADE');
      table.string('token', 512).unique().notNullable();
      table.datetime('expires_at').notNullable();
      table.boolean('is_revoked').notNullable().defaultTo(false);
      table.timestamp('revoked_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
};
