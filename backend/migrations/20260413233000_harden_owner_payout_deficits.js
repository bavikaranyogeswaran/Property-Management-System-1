export const up = async (knex) => {
  // 1. Add deficit tracking columns
  if (await knex.schema.hasTable('owner_payouts')) {
    await knex.schema.alterTable('owner_payouts', (table) => {
      table.bigInteger('deficit_amount').defaultTo(0).notNullable();
      table.integer('deficit_offset_payout_id').unsigned().nullable();
      table
        .foreign('deficit_offset_payout_id')
        .references('owner_payouts.payout_id')
        .onDelete('SET NULL');
    });

    // 2. Update the generated 'amount' column to ensure it never drops below 0.
    // Since 'amount' is already a STORED GENERATED column from 20260408130000,
    // we must drop it and recreate it with the GREATEST(0, ...) clause.
    await knex.schema.alterTable('owner_payouts', (table) => {
      table.dropColumn('amount');
    });

    await knex.raw(`
      ALTER TABLE owner_payouts 
      ADD COLUMN amount BIGINT 
      AS (GREATEST(0, gross_amount - commission_amount - expenses_amount)) STORED
    `);
  }
};

export const down = async (knex) => {
  if (await knex.schema.hasTable('owner_payouts')) {
    await knex.schema.alterTable('owner_payouts', (table) => {
      table.dropForeign('deficit_offset_payout_id');
      table.dropColumn('deficit_offset_payout_id');
      table.dropColumn('deficit_amount');
      table.dropColumn('amount');
    });

    // Restore original generated column behavior
    await knex.raw(`
      ALTER TABLE owner_payouts 
      ADD COLUMN amount BIGINT 
      AS (gross_amount - commission_amount - expenses_amount) STORED
    `);
  }
};
